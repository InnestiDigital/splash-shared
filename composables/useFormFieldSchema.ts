import * as yup from 'yup'
import type { FormFieldSettings } from '~/shared/types/blocks'

/**
 * Build a Yup validation schema from an array of FormFieldSettings.
 * Used by form container blocks (LoginForm, RegisterForm, etc.) to validate
 * dynamically-configured child FormField blocks.
 */
export function buildYupSchema(fields: FormFieldSettings[]): yup.ObjectSchema<any> {
  const shape: Record<string, yup.AnySchema> = {}

  for (const field of fields) {
    if (!field.fieldId) continue

    let rule: yup.AnySchema

    if (field.fieldType === 'checkbox') {
      rule = yup.boolean()
    } else if (field.fieldType === 'number') {
      rule = yup.number()
    } else {
      let stringRule = yup.string()
      if (field.fieldType === 'email') stringRule = stringRule.email('Invalid email address')
      if (field.minLength) stringRule = stringRule.min(field.minLength, `Minimum ${field.minLength} characters`)
      if (field.maxLength) stringRule = stringRule.max(field.maxLength, `Maximum ${field.maxLength} characters`)
      if (field.regex) {
        try {
          stringRule = stringRule.matches(new RegExp(field.regex), 'Invalid format')
        } catch {
          // Ignore invalid regex
        }
      }
      rule = stringRule
    }

    if (field.required) {
      rule = rule.required('This field is required')
    } else {
      rule = rule.optional()
    }

    shape[field.fieldId] = rule
  }

  return yup.object(shape)
}

/**
 * Resolve the initial value for a field based on its defaultValueSource config.
 */
export function resolveFieldDefault(
  field: FormFieldSettings,
  queryParams?: Record<string, string | string[]>,
  authData?: Record<string, any>
): any {
  if (!field.defaultValueSource || field.defaultValueSource === 'none') return undefined

  if (field.defaultValueSource === 'static') {
    return field.defaultValueKey ?? undefined
  }

  if (field.defaultValueSource === 'url_param' && queryParams && field.defaultValueKey) {
    const val = queryParams[field.defaultValueKey]
    return Array.isArray(val) ? val[0] : (val ?? undefined)
  }

  if (field.defaultValueSource === 'auth_state' && authData && field.defaultValueKey) {
    return authData[field.defaultValueKey] ?? undefined
  }

  return undefined
}
