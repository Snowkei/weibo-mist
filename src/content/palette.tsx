import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Icon } from '../shared/icons'
import { modKey } from '../shared/utils'
import { buildCommands, filterCommands, searchCommand, type Command } from './commands'
import { closePalette, ui, useStore } from './state'
import { useSettings } from './use-settings'

export function Palette() {
  const shell = useStore(ui)
  const settings = useSettings()
  const [query, setQuery] = useState(shell.paletteQuery)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo(() => buildCommands(settings), [settings])
  const results = useMemo(() => {
    const matched = filterCommands(commands, query)
    if (!query.trim()) return matched
    return [...matched, searchCommand(query)]
  }, [commands, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, results.length])

  const runAt = (index: number): void => {
    const command = results[index]
    if (!command) return
    closePalette()
    // Let the palette unmount before a command scrolls or navigates.
    window.setTimeout(() => command.run(), 0)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
      event.preventDefault()
      setActive((i) => (results.length ? (i + 1) % results.length : 0))
      return
    }
    if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
      event.preventDefault()
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      runAt(active)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closePalette()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const currentGroup = results[active]?.group
      const step = event.shiftKey ? -1 : 1
      for (let i = active + step; i >= 0 && i < results.length; i += step) {
        if (results[i]?.group !== currentGroup) {
          setActive(i)
          return
        }
      }
    }
  }

  const rows = useMemo(() => {
    const out: Array<{ group: string } | { command: Command; index: number }> = []
    let group = ''
    results.forEach((command, index) => {
      if (command.group !== group) {
        group = command.group
        out.push({ group })
      }
      out.push({ command, index })
    })
    return out
  }, [results])

  return (
    <div
      class="m-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePalette()
      }}
    >
      <div
        class="m-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Mist 命令面板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div class="m-palette-search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索命令、页面或设置…"
            aria-label="搜索命令"
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
            onKeyDown={onKeyDown}
          />
          <span class="m-kbd">esc</span>
        </div>

        <div class="m-palette-list" ref={listRef} role="listbox" aria-label="命令列表">
          {results.length === 0 ? (
            <div class="m-palette-empty">没有匹配的命令，试试「深色」或「过滤」</div>
          ) : (
            rows.map((row, rowIndex) =>
              'group' in row ? (
                <div class="m-palette-group" key={`group-${row.group}-${rowIndex}`}>
                  {row.group}
                </div>
              ) : (
                <button
                  key={row.command.id}
                  class="m-palette-item"
                  role="option"
                  aria-selected={row.index === active}
                  data-active={row.index === active}
                  onMouseMove={() => setActive(row.index)}
                  onClick={() => runAt(row.index)}
                >
                  <span class="m-palette-item-icon">
                    <Icon name={row.command.icon} size={17} />
                  </span>
                  <span class="m-palette-item-copy">
                    <span>{row.command.title}</span>
                    {row.command.hint ? <span class="m-palette-item-hint">{row.command.hint}</span> : null}
                  </span>
                  {row.command.keys?.length ? (
                    <span class="m-palette-item-hint">
                      {row.command.keys.map((key) => (
                        <span class="m-kbd" key={key}>
                          {key}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              ),
            )
          )}
        </div>

        <div class="m-palette-foot">
          <span class="m-palette-foot-group">
            <span class="m-kbd">↑</span>
            <span class="m-kbd">↓</span> 选择
          </span>
          <span class="m-palette-foot-group">
            <span class="m-kbd">↵</span> 执行
          </span>
          <span class="m-palette-foot-group">
            <span class="m-kbd">tab</span> 分组
          </span>
          <span class="m-palette-brand">{modKey()}K · MIST</span>
        </div>
      </div>
    </div>
  )
}
