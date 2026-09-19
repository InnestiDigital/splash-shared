// Block settings types — define the contract for block settings across themes.
// Any theme implementing these block types must conform to these interfaces.

// A block's background is a semantic role, not a mode plus a hex — see
// `BACKGROUND_ROLES` / `TEXT_ROLES` in `shared/types/placement.ts` and
// `docs/architecture/color-roles-phase-f.md`.

/**
 * Settings for a single form field block. This is the canonical shape shared
 * by every form container (LoginForm, RegisterForm, ShippingForm, etc.) and
 * is consumed both by block renderers and by the Yup schema builder in
 * `useFormFieldSchema`.
 */
export interface FormFieldSettings {
  fieldId: string
  fieldType?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'select' | 'checkbox' | 'radio' | 'textarea' | 'date'
  label?: Record<string, string> | string
  placeholder?: Record<string, string> | string
  required?: boolean
  minLength?: number
  maxLength?: number
  regex?: string
  rows?: number
  options?: Array<{ label: Record<string, string> | string; value: string }>
  helperText?: Record<string, string> | string
  helperEventKey?: string
  defaultValueSource?: 'none' | 'url_param' | 'previous_step' | 'auth_state' | 'static'
  defaultValueKey?: string
}

export interface FormButtonSettings {
  text: Record<string, string>
  buttonType: 'submit' | 'button'
  // Method execution settings
  methodType?: 'single' | 'sequence' | 'parallel'
  method?: string // Single API method key (from api.requests)
  methods?: string[] // Multiple API method keys (for sequence/parallel)
}

/**
 * Standardized block preset metadata shape.
 * `name` is the display label (localized or plain string for legacy headless).
 * `description`, `category`, `tags`, `isDefault` are optional — UI degrades gracefully.
 */
export interface BlockPreset {
  /** Display name — localized object or plain string (legacy headless pattern). */
  name: { [locale: string]: string } | string
  /** Short "when to use" copy shown below name in picker. */
  description?: { [locale: string]: string } | string
  /** Broad grouping used for client-side filtering in the preset picker. */
  category?: 'hero' | 'cta' | 'editorial' | 'media' | 'product' | 'marketing' | 'layout' | 'utility'
  /** Optional free-form tags for future filtering. */
  tags?: string[]
  /** When true the preset is auto-selected when only one non-legacy preset exists. */
  isDefault?: boolean
  settings: Record<string, unknown>
}

export type Block =
  | {
      id: string
      type: 'form-field'
      settings: FormFieldSettings
    }
  | {
      id: string
      type: 'form-button'
      settings: FormButtonSettings
    }
