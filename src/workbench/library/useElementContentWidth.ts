import React from 'react'

/** 量一个元素的内容宽（不含内边距）：库的列数跟着宿主宽走（抽屉可拖宽、窗口可缩）。 */
export function useElementContentWidth(element: HTMLElement | null): number {
  const [width, setWidth] = React.useState(0)
  React.useLayoutEffect(() => {
    if (!element) return undefined
    const read = () => {
      const style = getComputedStyle(element)
      setWidth(element.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0'))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return width
}
