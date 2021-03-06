const inferFromSchemaType = require('./inferFromSchemaType')

// Note: Mutates schema. Refactor when @lyra/schema supports middlewares
function inferFromSchema(schema) {
  const typeNames = schema.getTypeNames()
  typeNames.forEach(typeName => {
    inferFromSchemaType(schema.get(typeName))
  })
  return schema
}

module.exports = inferFromSchema
