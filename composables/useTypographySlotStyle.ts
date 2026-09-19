import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useClientConfig } from '~/shared/composables/useClientConfig'
import { buildTypographySlotStyle } from '~/shared/typography/buildTypographySlotStyle'

/**
 * Reactive wrapper around buildTypographySlotStyle.
 * Returns a computed style object for use with Vue :style binding.
 *
 * @param slotOverrides - Reactive map of slot name → preset key ref
 *   Example: { heading: computed(() => props.headingPresetKey) }
 */
export function useTypographySlotStyle(
  slotOverrides: Record<string, MaybeRefOrGetter<string | null | undefined>>,
): ReturnType<typeof computed<Record<string, string>>> {
  const { config } = useClientConfig()

  return computed(() => {
    const presets = config.value?.typographyPresets ?? []
    if (presets.length === 0) return {}

    // Unwrap all reactive slot overrides to plain values
    const resolved: Record<string, string | null | undefined> = {}
    for (const [slot, ref] of Object.entries(slotOverrides)) {
      resolved[slot] = toValue(ref)
    }

    return buildTypographySlotStyle(resolved, presets)
  })
}
