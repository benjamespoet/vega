const basename = require('path').basename
const parseUrl = require('url').parse
const debug = require('debug')('lyra:import')
const pMap = require('p-map')
const progressStepper = require('./util/progressStepper')
const getHashedBufferForUri = require('./util/getHashedBufferForUri')
const retryOnFailure = require('./util/retryOnFailure')

const ASSET_UPLOAD_CONCURRENCY = 3
const ASSET_PATCH_CONCURRENCY = 3
const ASSET_PATCH_BATCH_SIZE = 50

async function uploadAssets(assets, options) {
  // Build a Map where the keys are `type#url` and the value is an array of all
  // objects containing document id and path to inject asset reference to.
  // `assets` is an array of objects with shape: {documentId, path, url, type}
  const assetRefMap = getAssetRefMap(assets)

  // We might have additional assets that is not referenced by any documents, but was part of a
  // dataset when exporting, for instance. Add these to the map without any references to update.
  ;(options.unreferencedAssets || []).forEach(asset => {
    if (!assetRefMap.has(asset)) {
      assetRefMap.set(asset, [])
    }
  })

  // Create a function we can call for every completed upload to report progress
  const progress = progressStepper(options.onProgress, {
    step: 'Importing assets (files/images)',
    total: assetRefMap.size
  })

  // Loop over all unique URLs and ensure they exist, and if not, upload them
  const mapOptions = {concurrency: ASSET_UPLOAD_CONCURRENCY}
  const assetIds = await pMap(
    assetRefMap.keys(),
    ensureAssetWithRetries.bind(null, options, progress),
    mapOptions
  )

  // Loop over all documents that need asset references to be set
  const batches = await setAssetReferences(assetRefMap, assetIds, options)
  return batches.reduce((prev, add) => prev + add, 0)
}

function getAssetRefMap(assets) {
  return assets.reduce((assetRefMap, item) => {
    const {documentId, path, url, type} = item
    const key = `${type}#${url}`
    let refs = assetRefMap.get(key)
    if (!refs) {
      refs = []
      assetRefMap.set(key, refs)
    }

    refs.push({documentId, path})
    return assetRefMap
  }, new Map())
}

function ensureAssetWithRetries(...args) {
  return retryOnFailure(() => ensureAsset(...args))
}

async function ensureAsset(options, progress, assetKey, i) {
  const {client, assetMap = {}} = options
  const [type, url] = assetKey.split('#', 2)

  // Download the asset in order for us to create a hash
  debug('[Asset #%d] Downloading %s', i, url)
  const {buffer, sha1hash} = await getHashedBufferForUri(url)

  // See if the item exists on the server
  debug('[Asset #%d] Checking for asset with hash %s', i, sha1hash)
  const assetDocId = await getAssetDocumentIdForHash(client, type, sha1hash)
  if (assetDocId) {
    // Same hash means we want to reuse the asset
    debug('[Asset #%d] Found %s for hash %s', i, type, sha1hash)
    progress()
    return assetDocId
  }

  const assetMeta = assetMap[`${type}-${sha1hash}`]
  const hasFilename = assetMeta && assetMeta.originalFilename
  const hasNonFilenameMeta = assetMeta && Object.keys(assetMap).length > 1
  const {pathname} = parseUrl(url)
  const filename = hasFilename ? assetMeta.originalFilename : basename(pathname)

  // If it doesn't exist, we want to upload it
  debug('[Asset #%d] Uploading %s with URL %s', i, type, url)
  const asset = await client.assets.upload(type, buffer, {filename})
  progress()

  // If we have more metadata to provide, update the asset document
  if (hasNonFilenameMeta) {
    await client.patch(asset._id).set(assetMeta)
  }

  return asset._id
}

async function getAssetDocumentIdForHash(
  client,
  type,
  sha1hash,
  attemptNum = 0
) {
  // @todo remove retry logic when client has reintroduced it
  try {
    const dataType = type === 'file' ? 'lyra.fileAsset' : 'lyra.imageAsset'
    const query = '*[_type == $dataType && sha1hash == $sha1hash][0]._id'
    const assetDocId = await client.fetch(query, {dataType, sha1hash})
    return assetDocId
  } catch (err) {
    if (attemptNum < 3) {
      return getAssetDocumentIdForHash(client, type, sha1hash, attemptNum + 1)
    }

    err.attempts = attemptNum
    throw new Error(`Error while attempt to query Lyra API:\n${err.message}`)
  }
}

function setAssetReferences(assetRefMap, assetIds, options) {
  const {client} = options
  const lookup = assetRefMap.values()
  const patchTasks = assetIds.reduce((tasks, assetId) => {
    const documents = lookup.next().value
    return tasks.concat(
      documents.map(({documentId, path}) => ({
        documentId,
        path,
        assetId
      }))
    )
  }, [])

  // We now have an array of simple tasks, each containing:
  // {documentId, path, assetId}
  // Instead of doing a single mutation per asset, let's batch them up
  const batches = []
  for (let i = 0; i < patchTasks.length; i += ASSET_PATCH_BATCH_SIZE) {
    batches.push(patchTasks.slice(i, i + ASSET_PATCH_BATCH_SIZE))
  }

  // Since separate progress step for batches of reference sets
  const progress = progressStepper(options.onProgress, {
    step: 'Setting asset references to documents',
    total: batches.length
  })

  // Now perform the batch operations in parallel with a given concurrency
  const mapOptions = {concurrency: ASSET_PATCH_CONCURRENCY}
  return pMap(
    batches,
    setAssetReferenceBatch.bind(null, client, progress),
    mapOptions
  )
}

function setAssetReferenceBatch(client, progress, batch) {
  debug('Setting asset references on %d documents', batch.length)
  return retryOnFailure(() =>
    batch
      .reduce(reducePatch, client.transaction())
      .commit({visibility: 'async'})
      .then(progress)
      .then(res => res.results.length)
  )
}

function getAssetType(assetId) {
  return assetId.slice(0, assetId.indexOf('-'))
}

function reducePatch(trx, task) {
  return trx.patch(task.documentId, patch =>
    patch.set({
      [`${task.path}._type`]: getAssetType(task.assetId),
      [`${task.path}.asset`]: {
        _type: 'reference',
        _ref: task.assetId
      }
    })
  )
}

module.exports = uploadAssets
