import * as array from 'd3-array'
import * as scale from 'd3-scale'
import * as shape from 'd3-shape'
import PropTypes from 'prop-types'
import React, { PureComponent } from 'react'
import { View } from 'react-native'
import Svg, { Line } from 'react-native-svg'
import Path from './animated-path'

class Chart extends PureComponent {
    state = {
        width: 0,
        height: 0,
        plotLinesArray: [],
        seriesDisplay: [],
    }

    _onLayout(event) {
        const { nativeEvent: { layout: { height, width } } } = event
        this.setState({ height, width })
    }

    createPaths() {
        throw 'Extending "Chart" requires you to override "createPaths'
    }
    buildPlotLinesArray = ({ x, index, value, itemsName }) => (
        { x: x(index), index, value, name: itemsName }
    )

    binaryInsert(item,sortedList,low = 0,high = (sortedList.length - 1)) {
        if(sortedList && sortedList.length > 0){
            if (low == high) {
                // hit end of sortedList - done
                if (low > 0) {
                    return {
                        name: sortedList[low - 1].name,
                        value: sortedList[low - 1].value,
                    }
                }
                // return 0
                return {
                    name: sortedList[low].name,
                    value: sortedList[low].value,
                }
            }

            // get midpoint of list and item value
            let mid = low + Math.floor((high - low) / 2),
                itemCompare = sortedList[mid].x

            if (item > itemCompare) {
                // work higher end of list
                return this.binaryInsert(item,sortedList,mid + 1,high)
            }

            if (item < itemCompare) {
                // work lower end of list
                return this.binaryInsert(item,sortedList,low,mid)
            }

            // found equal value - done
            if (mid > 0) {
                return {
                    name: sortedList[mid - 1].name,
                    value: sortedList[mid - 1].value,
                }
            }
            // return 0
            return {
                name: sortedList[mid].name,
                value: sortedList[mid].value,
            }
        }
        return 0
    }

    updateSeriesDisplay (newState) {
        this.setState({
            seriesDisplay: newState,
        })
    }

    componentWillReceiveProps (newProps) {
        const {
            data,
            xAccessor,
            yAccessor,
            yScale,
            xScale,
            numberOfTicks,
            contentInset: {
                top = 0,
                bottom = 0,
                left = 0,
                right = 0,
            },
            plotLines,
            panResponderReleased,
        } = newProps

        const { width, height } = this.state
        if(data && data.length > 0) {
            const mappedData = data.map(items =>
                items.datapoints.map((item, i) => ({
                    y: yAccessor({ item, i }),
                    x: xAccessor({ item, i }),
                })))

            let yValues = []
            const yValuesSequence = data.map(items => items.datapoints.map(item => yValues.push(item[1])))
            let xValues = []
            const xValuesSequence = data.map(items => items.datapoints.map(item => xValues.push(item[0])))

            const yExtent = array.extent([ ...yValues ])
            const xExtent = array.extent([ ...xValues ])
            const xScaleFactor = Math.max(...xValuesSequence.map(items => items.length))
            //invert range to support svg coordinate system

            const y = yScale()
                .domain(yExtent)
                .range([ height - bottom, top ])
            const x = xScale()
                .domain(xExtent)
                .range([ left, width - right ])
            const x2 = xScale()
                .domain([ 0, xScaleFactor - 1 ])
                .range([ left, width - right ])

            const pathsArr = mappedData.map(items => this.createPaths({
                data: items,
                x,
                y,
            }))

            this.setState({ pathsArr })

            const ticks = y.ticks(numberOfTicks)

            this.setState({ ticks })

            const plotLinesArray = data.map(items => items.datapoints.map((value, index) => {
                const itemsName = items.name
                return this.buildPlotLinesArray({ x: x2, y, value, index, itemsName })
            }))
            this.setState({ plotLinesArray })

            const latestPlotLineX = plotLinesArray[0][plotLinesArray[0].length - 1].x
            this.setState({ latestPlotLineX })

            if (panResponderReleased) {
                const nativeEventXY = plotLinesArray.map(items=>this.binaryInsert(latestPlotLineX, items))
                this.setState({ nativeEventXY })
            } else {
                const nativeEventXY = plotLinesArray.map(items=>this.binaryInsert(plotLines.nativeEventX, items))
                this.setState({ nativeEventXY })
            }

            const extraProps = {
                x,
                y,
                data,
                ticks,
                width,
                height,
                ...pathsArr,
            }
            this.setState({ extraProps })
        }
    }

    render() {
        const { height, extraProps, pathsArr, nativeEventXY, latestPlotLineX, seriesDisplay } = this.state
        const {
            data,
            style,
            panHandlers,
            plotLines,
            showPlotLines,
            plotLinesProps,
            panResponderReleased,
            svg,
            animate,
            animationDuration,
            children,
            legendComponent,
            seriesConfig,
        } = this.props

        if (data.length === 0) {
            return <View style={ style }/>
        }

        return (
            <View style={ style }>
                <View>
                    {legendComponent && React.cloneElement(legendComponent,
                        {
                            nativeEventXY,
                            seriesDisplayHandler: this.updateSeriesDisplay.bind(this),
                        }
                    )}
                </View>
                <View style={{ flex: 1 }} onLayout={ event => this._onLayout(event) } { ...panHandlers }>
                    <Svg style={{ flex: 1 }}>
                        {
                            React.Children.map(children, child => {
                                if (child.props.belowChart) {
                                    return React.cloneElement(child, extraProps)
                                }
                                return null
                            })
                        }
                        {showPlotLines &&
                            <Line
                                x1= { panResponderReleased ? latestPlotLineX : plotLines.nativeEventX }
                                y1="0"
                                x2= { panResponderReleased ? latestPlotLineX : plotLines.nativeEventX }
                                y2= { height }
                                stroke={ plotLinesProps.stroke }
                                strokeWidth={ plotLinesProps.strokeWidth } />
                        }
                        {pathsArr && pathsArr.length > 0 &&
                            pathsArr.map((paths, index) =>
                                seriesConfig.map(configItems => {
                                    if (data[index].name === configItems.name) {
                                        const itemVisible = seriesDisplay.find(item => item.name === data[index].name)
                                        if (itemVisible && !itemVisible.display) {
                                            return
                                        }
                                        return <Path
                                            key = { index }
                                            fill={ 'none' }
                                            { ...svg }
                                            stroke={ configItems.color }
                                            d={ paths.path }
                                            animate={ animate }
                                            animationDuration={ animationDuration }
                                        />
                                    }
                                }
                                )
                            )
                        }
                        {
                            React.Children.map(children, child => {
                                if (!child.props.belowChart) {
                                    return React.cloneElement(child, extraProps)
                                }
                                return null
                            })
                        }

                    </Svg>
                </View>
            </View>
        )
    }
}

Chart.propTypes = {
    data: PropTypes.oneOfType([
        PropTypes.arrayOf(PropTypes.object),
        PropTypes.arrayOf(PropTypes.number),
    ]).isRequired,
    svg: PropTypes.object,

    style: PropTypes.any,

    animate: PropTypes.bool,
    animationDuration: PropTypes.number,

    curve: PropTypes.func,
    contentInset: PropTypes.shape({
        top: PropTypes.number,
        left: PropTypes.number,
        right: PropTypes.number,
        bottom: PropTypes.number,
    }),
    numberOfTicks: PropTypes.number,

    gridMin: PropTypes.number,
    gridMax: PropTypes.number,
    gridProps: PropTypes.object,

    showPlotLines: PropTypes.bool,
    plotLines: PropTypes.object,
    plotLinesProps: PropTypes.object,

    panResponderReleased: PropTypes.bool,

    xScale: PropTypes.func,
    yScale: PropTypes.func,

    xAccessor: PropTypes.func,
    yAccessor: PropTypes.func,

    legendComponent: PropTypes.object,
    seriesConfig: PropTypes.arrayOf(PropTypes.object),
}

Chart.defaultProps = {
    svg: {},
    width: 100,
    height: 100,
    curve: shape.curveLinear,
    contentInset: {},
    numberOfTicks: 10,
    xScale: scale.scaleLinear,
    yScale: scale.scaleLinear,
    xAccessor: ({ index }) => index,
    yAccessor: ({ item }) => item,
    plotLinesProps: { stroke: 'red', strokeWidth: '2' },
}

export default Chart
