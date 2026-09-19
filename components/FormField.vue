<template>
  <div class="form-field-wrapper">
    <!-- Checkbox -->
    <div v-if="settings.fieldType === 'checkbox'" class="form-field__checkbox-group">
      <input
        :id="inputId"
        type="checkbox"
        :name="settings.fieldId"
        :checked="value as boolean"
        :required="settings.required"
        class="form-field__checkbox"
        v-bind="field"
        @change="handleChange"
        @blur="handleBlur"
      />
      <label v-if="labelText" :for="inputId" class="form-field__label form-field__label--inline">
        {{ labelText }}
        <span v-if="settings.required" class="form-field__required" aria-hidden="true">*</span>
      </label>
      <span v-if="errorMessage" class="form-field__error" role="alert">{{ errorMessage }}</span>
    </div>

    <!-- Select -->
    <div v-else-if="settings.fieldType === 'select'" class="form-field__group">
      <label v-if="labelText" :for="inputId" class="form-field__label">
        {{ labelText }}
        <span v-if="settings.required" class="form-field__required" aria-hidden="true">*</span>
      </label>
      <select
        :id="inputId"
        :name="settings.fieldId"
        :required="settings.required"
        :aria-invalid="!!errorMessage"
        :aria-describedby="errorMessage ? `${inputId}-error` : undefined"
        class="form-field__select"
        :class="{ 'form-field__select--error': !!errorMessage }"
        v-bind="field"
        @change="handleChange"
        @blur="handleBlur"
      >
        <option v-if="placeholderText" value="">{{ placeholderText }}</option>
        <option v-for="opt in resolvedOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <span v-if="errorMessage" :id="`${inputId}-error`" class="form-field__error" role="alert">{{ errorMessage }}</span>
      <span v-else-if="helperText" class="form-field__helper">{{ helperText }}</span>
    </div>

    <!-- Textarea -->
    <div v-else-if="settings.fieldType === 'textarea'" class="form-field__group">
      <label v-if="labelText" :for="inputId" class="form-field__label">
        {{ labelText }}
        <span v-if="settings.required" class="form-field__required" aria-hidden="true">*</span>
      </label>
      <textarea
        :id="inputId"
        :name="settings.fieldId"
        :required="settings.required"
        :minlength="settings.minLength"
        :maxlength="settings.maxLength"
        :placeholder="placeholderText"
        :rows="settings.rows || 4"
        :aria-invalid="!!errorMessage"
        :aria-describedby="errorMessage ? `${inputId}-error` : undefined"
        class="form-field__textarea"
        :class="{ 'form-field__textarea--error': !!errorMessage }"
        v-bind="field"
        @input="handleChange"
        @blur="handleBlur"
      />
      <span v-if="errorMessage" :id="`${inputId}-error`" class="form-field__error" role="alert">{{ errorMessage }}</span>
      <span v-else-if="helperText" class="form-field__helper">{{ helperText }}</span>
    </div>

    <!-- Default: text, email, password, tel, number, date -->
    <div v-else class="form-field__group">
      <label v-if="labelText" :for="inputId" class="form-field__label">
        {{ labelText }}
        <span v-if="settings.required" class="form-field__required" aria-hidden="true">*</span>
      </label>
      <input
        :id="inputId"
        :name="settings.fieldId"
        :type="settings.fieldType || 'text'"
        :required="settings.required"
        :minlength="settings.minLength"
        :maxlength="settings.maxLength"
        :placeholder="placeholderText"
        :autocomplete="autocomplete"
        :aria-invalid="!!errorMessage"
        :aria-describedby="errorMessage ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined"
        class="form-field__input"
        :class="{ 'form-field__input--error': !!errorMessage }"
        v-bind="field"
        @input="handleChange"
        @blur="handleBlur"
      />
      <span v-if="errorMessage" :id="`${inputId}-error`" class="form-field__error" role="alert">{{ errorMessage }}</span>
      <span v-else-if="helperText" :id="`${inputId}-helper`" class="form-field__helper">
        {{ helperText }}
        <button v-if="settings.helperEventKey" type="button" class="form-field__helper-btn" @click="emit('helper-click', settings.helperEventKey)">
          {{ helperText }}
        </button>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue'
import { useField } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import { resolveFieldDefault } from '~/shared/composables/useFormFieldSchema'
import type { FormFieldSettings } from '~/shared/types/blocks'

const props = defineProps<{
  fieldId: string
  settings: FormFieldSettings
  queryParams?: Record<string, string | string[]>
  authData?: Record<string, any>
}>()

const emit = defineEmits<{
  'helper-click': [eventKey?: string]
}>()

const { locale } = useI18n()
const instance = getCurrentInstance()
const inputId = computed(() => `field-${props.fieldId}-${instance?.uid ?? 0}`)

function localized(v?: Record<string, string> | string): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v[locale.value] || v['en-US'] || Object.values(v)[0] || ''
}

const labelText = computed(() => localized(props.settings.label))
const placeholderText = computed(() => localized(props.settings.placeholder))
const helperText = computed(() => localized(props.settings.helperText))

const resolvedOptions = computed(() => {
  if (!props.settings.options) return []
  return props.settings.options.map(opt => ({
    value: opt.value,
    label: localized(opt.label),
  }))
})

// Sensible autocomplete hints based on field type and ID
const autocomplete = computed(() => {
  const id = props.fieldId.toLowerCase()
  if (props.settings.fieldType === 'email' || id.includes('email')) return 'email'
  if (props.settings.fieldType === 'password') return id.includes('new') || id.includes('confirm') ? 'new-password' : 'current-password'
  if (id.includes('first') && id.includes('name')) return 'given-name'
  if (id.includes('last') && id.includes('name')) return 'family-name'
  if (id.includes('phone') || props.settings.fieldType === 'tel') return 'tel'
  return undefined
})

// Resolve initial/default value
const defaultValue = computed(() => resolveFieldDefault(props.settings, props.queryParams, props.authData))

const { value, errorMessage, handleChange, handleBlur, field } = useField<any>(
  () => props.fieldId,
  undefined,
  { initialValue: defaultValue.value }
)
</script>

<style scoped lang="scss">
.form-field-wrapper {
  width: 100%;
}

.form-field__group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 0.4rem);
}

.form-field__label {
  font-size: var(--font-size-sm, 1.3rem);
  font-weight: var(--font-weight-normal, 400);
  color: var(--color-text-light, #555);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs, 0.4rem);
}

.form-field__label--inline {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm, 0.8rem);
  cursor: pointer;
}

.form-field__required {
  color: var(--color-error, #d32f2f);
}

.form-field__input,
.form-field__select,
.form-field__textarea {
  padding: var(--spacing-sm, 0.8rem) var(--spacing-md, 1.2rem);
  border: 0.1rem solid var(--border-color-input, #ccc);
  border-radius: var(--border-radius, 0.4rem);
  background-color: var(--color-background, #fff);
  color: var(--color-text, #222);
  font-size: var(--font-size-base, 1.5rem);
  font-family: inherit;
  min-height: 4.8rem;
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &::placeholder {
    color: var(--color-text-lighter, #aaa);
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary, #005bbb);
    box-shadow: 0 0 0 0.3rem var(--color-primary-focus-ring, rgba(0, 91, 187, 0.2));
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--color-background-light, #f5f5f5);
  }

  &--error {
    border-color: var(--color-error, #d32f2f);

    &:focus {
      box-shadow: 0 0 0 0.3rem var(--color-error-focus-ring, rgba(211, 47, 47, 0.2));
    }
  }
}

.form-field__select {
  appearance: none;
  cursor: pointer;
}

.form-field__textarea {
  min-height: unset;
  resize: vertical;
}

.form-field__checkbox-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 0.8rem);
}

.form-field__checkbox {
  width: 1.8rem;
  height: 1.8rem;
  flex-shrink: 0;
  accent-color: var(--color-primary, #005bbb);
  cursor: pointer;

  &:focus-visible {
    outline: 0.2rem solid var(--color-primary, #005bbb);
    outline-offset: 0.2rem;
  }
}

.form-field__error {
  color: var(--color-error, #d32f2f);
  font-size: var(--font-size-sm, 1.3rem);
}

.form-field__helper {
  color: var(--color-text-light, #555);
  font-size: var(--font-size-sm, 1.3rem);
}

.form-field__helper-btn {
  background: none;
  border: none;
  color: var(--color-primary, #005bbb);
  cursor: pointer;
  font-size: inherit;
  padding: 0;
  text-decoration: underline;
}
</style>
