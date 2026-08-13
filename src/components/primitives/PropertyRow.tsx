import { useId, type ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { cn } from '@/lib/utils';

/**
 * PropertyRow — DESIGN_SYSTEM §11.7. The generic Inspector form primitive.
 * Renders one labeled control from a registry `configSchema` field. ONE layout
 * system — no per-node-type Inspector (plan §14, line 797/503). Every field
 * change calls `graphSlice.updateNodeData` → sets `dirty` (spec §8.2).
 *
 * Anatomy (§11.7): `flex flex-col gap-1 py-1` → `flex items-center gap-2 h-7`
 * (label w-24 shrink-0 11px text-secondary + control flex-1 + optional unit) →
 * error (role="alert" 11px text-error, replaces helperText) or helperText (11px
 * text-muted, aria-describedby). 28px row (textarea breaks to min-h-16 64px).
 *
 * Tokens by name only: surface.input, border.subtle, border.focus (via global
 * :focus-visible in App.css), text.primary/secondary/muted/error, radius.control,
 * accent (toggle on, slider fill). No raw hex.
 *
 * A11y: label htmlFor + aria-describedby → helper+error; error role="alert";
 * disabled → aria-disabled + title tooltip (disabledReason); slider exposes
 * aria-valuenow/min/max; toggle role="switch" aria-checked.
 *
 * `ConfigFieldType` in the registry uses `'file-picker'`; this primitive's `type`
 * union uses `'file'`. The NodeInspector reconciles `file-picker` → `file` at the
 * call site so the registry type stays untouched (spec §13 frozen).
 */
export interface PropertyRowProps {
  label: string;
  type?: 'text' | 'password' | 'textarea' | 'number' | 'select' | 'toggle' | 'slider' | 'file';
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  disabledReason?: string;
  unit?: string;
  id?: string;
  ariaLabel?: string;
  pickerMode?: 'file' | 'directory';
}

export function PropertyRow({
  label,
  type = 'text',
  value,
  onChange,
  options,
  min,
  max,
  step,
  placeholder,
  helperText,
  error,
  disabled = false,
  disabledReason,
  unit,
  id,
  ariaLabel,
  pickerMode = 'file',
}: PropertyRowProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helperId = `${fieldId}-help`;
  const errorId = `${fieldId}-err`;
  const describedBy = [
    helperText ? helperId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  const controlBase =
    'h-7 w-full bg-surface-input border border-border-subtle rounded-control px-2 text-[12px] text-text-primary disabled:opacity-60 disabled:cursor-not-allowed';
  const sharedInputProps = {
    id: fieldId,
    disabled,
    'aria-disabled': disabled || undefined,
    'aria-describedby': describedBy || undefined,
    'aria-label': ariaLabel,
    title: disabled && disabledReason ? disabledReason : undefined,
  } as const;

  let control: ReactNode;
  if (type === 'textarea') {
    control = (
      <textarea
        {...sharedInputProps}
        value={value as string}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          controlBase,
          'min-h-16 py-1 leading-snug resize-y h-auto',
        )}
      />
    );
  } else if (type === 'select') {
    control = (
      <select
        {...sharedInputProps}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={controlBase}
      >
        {options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  } else if (type === 'toggle') {
    control = (
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        aria-label={ariaLabel ?? label}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        title={disabled && disabledReason ? disabledReason : undefined}
        onClick={() => !disabled && onChange(!value)}
        className="relative h-5 w-9 shrink-0 rounded-full border border-border-subtle transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: value ? 'var(--accent)' : 'var(--surface-input)' }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-surface-elevated transition-transform"
          style={{ left: '2px', transform: value ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </button>
    );
  } else if (type === 'slider') {
    control = (
      <input
        type="range"
        {...sharedInputProps}
        value={Number(value)}
        min={min}
        max={max}
        step={step}
        aria-valuenow={Number(value)}
        aria-valuemin={min}
        aria-valuemax={max}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="h-7 w-full"
        style={{ accentColor: 'var(--accent)' }}
      />
    );
  } else if (type === 'file') {
    const browseDisabled = disabled || !isTauri();
    const browse = async () => {
      const selected = await open({ directory: pickerMode === 'directory', multiple: false });
      if (typeof selected === 'string') onChange(selected);
    };
    control = (
      <div className="flex items-center gap-2">
        <input
          type="text"
          {...sharedInputProps}
          value={value as string}
          placeholder={placeholder ?? 'Path…'}
          onChange={(e) => onChange(e.target.value)}
          className={cn(controlBase, 'flex-1')}
        />
        <button
          type="button"
          disabled={browseDisabled}
          aria-disabled={browseDisabled || undefined}
          title={!isTauri() ? 'Native file dialog is available in the desktop app' : undefined}
          onClick={() => void browse()}
          className="h-7 shrink-0 rounded-control border border-border-subtle bg-surface-panel px-2 text-[11px] text-text-muted"
        >
          Browse…
        </button>
      </div>
    );
  } else if (type === 'number') {
    control = (
      <input
        type="number"
        {...sharedInputProps}
        value={value as number}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={controlBase}
      />
    );
  } else {
    control = (
      <input
        type={type === 'password' ? 'password' : 'text'}
        {...sharedInputProps}
        value={value as string}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={controlBase}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2 h-7">
        <label
          className="w-24 shrink-0 text-[11px] text-text-secondary"
          htmlFor={fieldId}
        >
          {label}
        </label>
        <div className="flex-1 min-w-0">{control}</div>
        {unit ? (
          <span className="shrink-0 text-[11px] text-text-muted">{unit}</span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" id={errorId} className="text-[11px] text-text-error">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-[11px] text-text-muted">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
