/**
 * [INPUT]: 依赖 react、react-i18next、../../../../../utils/cn、../../../../../vendor/tablerIcons 的 IconRefresh、../../scene/sceneTheme 的 CHARACTER_COLOR_PRESETS、./useNumberDraft
 * [OUTPUT]: 对外提供 SectionHeader（分区标题 + 可选重置）、Vec3Fields（XYZ 三数字输入）、ColorField（色板 + 自定义 + 清除）、
 *           TextField、ToggleField、InspectorCard
 * [POS]: director/panels/fields 的检查器原语集：所有属性面板只用这些拼装，保证字段密度/重置/单位表现一致（清单 §4 通用）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../../../utils/cn'
import { IconRefresh } from '../../../../../../vendor/tablerIcons'
import type { Vec3 } from '../../model/directorTypes'
import { CHARACTER_COLOR_PRESETS } from '../../scene/sceneTheme'
import { useNumberDraft } from './useNumberDraft'

export function InspectorCard({ children, className }: { children: React.ReactNode; className?: string }): JSX.Element {
  return <section className={cn('rounded-nomi border border-nomi-line-soft bg-nomi-paper px-3 py-2', className)}>{children}</section>
}

export function SectionHeader({ title, onReset, resetLabel, resetHint }: { title: string; onReset?: () => void; resetLabel?: string; resetHint?: string }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-micro font-semibold uppercase tracking-wide text-nomi-ink-40">{title}</span>
      {onReset ? (
        <button type="button" className="inline-flex items-center gap-1 rounded-nomi-sm px-1 py-0.5 text-micro text-nomi-ink-40 hover:bg-workbench-hover hover:text-nomi-ink" title={resetHint} onClick={onReset}>
          <IconRefresh size={12} stroke={2} />
          {resetLabel ?? t('director.fields.reset')}
        </button>
      ) : null}
    </div>
  )
}

function NumberInput({ value, onCommit, digits = 2, className }: { value: number; onCommit: (next: number) => void; digits?: number; className?: string }): JSX.Element {
  const draft = useNumberDraft(value, digits, onCommit)
  return (
    <input
      type="text"
      inputMode="decimal"
      className={cn('w-full rounded-nomi-sm border border-nomi-line bg-nomi-bg px-1.5 py-0.5 text-right font-nomi-mono text-caption text-nomi-ink', className)}
      {...draft}
      onWheel={(event) => {
        event.preventDefault()
        const step = digits === 0 ? 1 : digits === 1 ? 0.1 : 0.01
        onCommit(Number((value + (event.deltaY < 0 ? step : -step)).toFixed(digits)))
      }}
    />
  )
}

export function Vec3Fields({ label, value, onChange, onChangeStart, digits = 2, axisLabels }: { label: string; value: Vec3; onChange: (next: Vec3) => void; onChangeStart?: () => void; digits?: number; axisLabels?: [string, string, string] }): JSX.Element {
  const labels = axisLabels ?? ['X', 'Y', 'Z']
  return (
    <div className="grid grid-cols-[72px_repeat(3,1fr)] items-center gap-1.5 py-1 text-caption text-nomi-ink-80">
      <span className="truncate" title={label}>{label}</span>
      {(['x', 'y', 'z'] as const).map((axis, index) => (
        <span key={axis} className="relative" title={labels[index]}>
          <NumberInput
            value={value[axis]}
            digits={digits}
            onCommit={(next) => {
              onChangeStart?.()
              onChange({ ...value, [axis]: next })
            }}
          />
        </span>
      ))}
    </div>
  )
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (next: string) => void }): JSX.Element {
  const [draft, setDraft] = React.useState<string | null>(null)
  return (
    <label className="grid grid-cols-[72px_1fr] items-center gap-2 py-1 text-caption text-nomi-ink-80">
      <span className="truncate">{label}</span>
      <input
        type="text"
        className="w-full rounded-nomi-sm border border-nomi-line bg-nomi-bg px-2 py-0.5 text-caption text-nomi-ink"
        value={draft ?? value}
        onFocus={() => setDraft(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null && draft.trim() && draft !== value) onCommit(draft.trim())
          setDraft(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
          if (event.key === 'Escape') setDraft(null)
        }}
      />
    </label>
  )
}

export function ToggleField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (next: boolean) => void; hint?: string }): JSX.Element {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-caption text-nomi-ink-80" title={hint}>
      <span className="truncate">{label}</span>
      <input type="checkbox" className="accent-nomi-accent" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

export function ColorField({ label, value, onChange, onChangeStart, presets, allowClear }: { label: string; value: string; onChange: (next: string) => void; onChangeStart?: () => void; presets?: ReadonlyArray<{ id: string; value: string }>; allowClear?: boolean }): JSX.Element {
  const { t } = useTranslation()
  const swatches = presets ?? CHARACTER_COLOR_PRESETS
  const changing = React.useRef(false)
  const commit = (next: string) => {
    if (next === value) return
    onChangeStart?.()
    onChange(next)
  }
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-2 py-1 text-caption text-nomi-ink-80">
      <span className="truncate">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {swatches.map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            title={t(`director.colorPreset.${swatch.id}`)}
            aria-label={t(`director.colorPreset.${swatch.id}`)}
            className={cn('size-4 rounded-full border-2', value.toLowerCase() === swatch.value.toLowerCase() ? 'border-nomi-ink' : 'border-transparent')}
            style={{ backgroundColor: swatch.value }}
            onClick={() => commit(swatch.value)}
          />
        ))}
        <input
          type="color"
          aria-label={t('director.fields.customColor')}
          title={t('director.fields.customColor')}
          className="size-5 cursor-pointer rounded-nomi-sm border border-nomi-line bg-transparent p-0"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'}
          onClick={() => { changing.current = false }}
          onBlur={() => { changing.current = false }}
          onChange={(event) => {
            if (!changing.current) { onChangeStart?.(); changing.current = true }
            onChange(event.target.value)
          }}
        />
        {allowClear ? (
          <button type="button" className="rounded-nomi-sm px-1 text-micro text-nomi-ink-40 hover:bg-workbench-hover hover:text-nomi-ink" onClick={() => commit('')}>
            {t('director.fields.clearColor')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
