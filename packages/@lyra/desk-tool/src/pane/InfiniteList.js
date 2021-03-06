import PropTypes from 'prop-types'
import React from 'react'
import VirtualList from 'react-tiny-virtual-list'
import enhanceWithAvailHeight from './enhanceWithAvailHeight'

const ITEM_SIZES = {
  list: 56,
  default: 56,
  detail: 90
}

export default enhanceWithAvailHeight(
  class InfiniteList extends React.Component {
    static propTypes = {
      height: PropTypes.number,
      items: PropTypes.array, // eslint-disable-line react/forbid-prop-types
      renderItem: PropTypes.func,
      className: PropTypes.string,
      getItemKey: PropTypes.func,
      layout: PropTypes.oneOf(['default', 'detail', 'card', 'media']),
      onScroll: PropTypes.func
    }

    static defaultProps = {
      layout: 'default',
      items: [],
      height: 250
    }

    state = {
      triggerUpdate: 0
    }

    componentWillReceiveProps(prevProps) {
      if (prevProps.items !== this.props.items) {
        /* This is needed to break equality checks
       in VirtualList's sCU in cases where itemCount has not changed,
       but an elements has been removed or added
       */
        this.setState({triggerUpdate: Math.random()})
      }

      if (prevProps.layout !== this.props.layout) {
        this.setState({
          itemSize: undefined
        })
      }
    }

    setMeasureElement = element => {
      if (element && element.offsetHeight) {
        this.setState({
          itemSize: element.offsetHeight
        })
      }
    }

    renderItem = ({index, style}) => {
      const {renderItem, getItemKey, items} = this.props
      const item = items[index]
      return (
        <div key={getItemKey(item)} style={style}>
          {renderItem(item, index)}
        </div>
      )
    }

    render() {
      const {layout, height, items, className} = this.props
      const {triggerUpdate} = this.state

      if (!items || items.length === 0) {
        return <div />
      }

      return (
        <VirtualList
          onScroll={this.props.onScroll}
          key={
            layout /* forcefully re-render the whole list when layout changes */
          }
          className={className || ''}
          height={height}
          itemCount={items.length}
          itemSize={ITEM_SIZES[layout || 'default']}
          renderItem={this.renderItem}
          overscanCount={50}
          data-trigger-update-hack={
            triggerUpdate
          } /* see componentWillReceiveProps above */
        />
      )
    }
  }
)
