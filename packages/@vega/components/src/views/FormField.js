/* eslint-disable complexity */
import PropTypes from 'prop-types'
import React from 'react'

import styles from 'part:@lyra/components/formfields/default-style'
import DefaultLabel from 'part:@lyra/components/labels/default'
import ValidationStatus from 'part:@lyra/components/validation/status'
import ValidationList from 'part:@lyra/components/validation/list'
import CustomMarkers from './CustomMarkers'
import CopyPath from './CopyPath'
import formFieldStyles from './styles/FormField.css'

export default class FormField extends React.Component {
  static propTypes = {
    label: PropTypes.string,
    className: PropTypes.string,
    inline: PropTypes.bool,
    description: PropTypes.string,
    level: PropTypes.number,
    children: PropTypes.node,
    wrapped: PropTypes.bool,
    labelFor: PropTypes.string,
    markers: PropTypes.arrayOf(
      PropTypes.shape({
        type: PropTypes.string
      })
    )
  }

  static defaultProps = {
    level: 1,
    markers: []
  }

  state = {
    showValidationMessages: false
  }

  handleToggleShowValidation = event => {
    this.setState(prevState => ({
      showValidationMessages: !prevState.showValidationMessages
    }))
  }

  render() {
    const {
      level,
      label,
      labelFor,
      description,
      children,
      inline,
      wrapped,
      className,
      markers
    } = this.props

    const {showValidationMessages} = this.state

    const levelClass = `level_${level}`

    const customMarkers = markers.filter(marker => marker.type !== 'validation')
    const highlightedMarker = customMarkers.find(mrk => mrk.highlighted)
    const highlightedMarkerId =
      highlightedMarker && highlightedMarker.item.pointer.path.length === 1
        ? highlightedMarker.highlighted
        : null
    return (
      <div
        className={`
          ${inline ? styles.inline : styles.block}
          ${styles[levelClass] || ''}
          ${wrapped ? styles.wrapped : ''}
          ${className || ''}`}
      >
        <label className={styles.inner} htmlFor={labelFor}>
          {label && (
            <div className={styles.header}>
              <div className={styles.headerMain}>
                {label && (
                  <DefaultLabel className={styles.label} level={level}>
                    {label}
                  </DefaultLabel>
                )}
                {description && (
                  <div className={styles.description}>{description}</div>
                )}
              </div>
              <div className={styles.headerStatus}>
                <div
                  onClick={this.handleToggleShowValidation}
                  className={styles.validationStatus}
                >
                  <ValidationStatus markers={markers} />
                </div>
                <CustomMarkers markers={customMarkers} />
                <CopyPath />
              </div>
            </div>
          )}
          <div
            className={
              showValidationMessages
                ? styles.validationList
                : styles.validationListClosed
            }
          >
            <ValidationList markers={markers} />
          </div>
          <div
            id={highlightedMarkerId ? highlightedMarkerId : null}
            className={[
              styles.content,
              (highlightedMarkerId && formFieldStyles.withMarkerHighlight) || ''
            ].join(' ')}
          >
            {children}
          </div>
        </label>
      </div>
    )
  }
}
