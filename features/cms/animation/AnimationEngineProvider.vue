<script setup lang="ts">
import { provide, watch, toRef, onUnmounted } from 'vue'
import type { AnimationScene, ReducedMotionMode } from '~/shared/types/animation'
import { useAnimationEngine } from './useAnimationEngine'
import { scenesEqual } from './sceneEquality'
import { ENGINE_KEY } from './constants'
import { useCmsPreview } from '~/shared/composables/useCmsPreview'

const props = defineProps<{
  scenes: AnimationScene[]
  motionDefaults?: {
    defaultDuration?: number
    defaultEasing?: string
    reducedMotion?: ReducedMotionMode
  }
}>()

const engine = useAnimationEngine({
  themeMotionDefaults: props.motionDefaults,
})

// Provide engine to descendants (AnimatedBlock components)
provide(ENGINE_KEY, engine)

// Inside the editor preview, register this engine for the transient scene
// postMessages (SCENE_UPSERT/REMOVE/SCRUB/COMMAND/TARGETS_REFRESH). The
// preview renders through DynamicPage, whose engine lives here — without
// this registration the timeline editor's live scrub/preview would go to a
// dead engine reference.
const preview = useCmsPreview()
// Optional-chained: test doubles of useCmsPreview often stub only the members
// a given suite exercises.
if (preview.isInPreviewMode() && typeof preview.setAnimationEngine === 'function') {
  preview.setAnimationEngine(engine)
  onUnmounted(() => preview.setAnimationEngine(null))
}

// Initial scene load
engine.loadScenes(props.scenes)

// Watch for scene changes — diff and apply granularly
watch(toRef(props, 'scenes'), (newScenes, oldScenes) => {
  if (!oldScenes) {
    engine.loadScenes(newScenes)
    return
  }

  // Build maps for diffing
  const oldMap = new Map(oldScenes.map(s => [s.id, s]))
  const newMap = new Map(newScenes.map(s => [s.id, s]))

  // Remove scenes that no longer exist
  for (const [id] of oldMap) {
    if (!newMap.has(id)) {
      engine.removeScene(id)
    }
  }

  // Upsert new or changed scenes — structural equality on mutable fields only.
  // JSON.stringify was key-order-sensitive (spurious teardown/setup) and O(n)
  // over every keyframe on every reactive update.
  for (const [id, scene] of newMap) {
    const old = oldMap.get(id)
    if (!old || !scenesEqual(old, scene)) {
      engine.upsertScene(scene)
    }
  }
}, { deep: true })
</script>

<template>
  <slot />
</template>
