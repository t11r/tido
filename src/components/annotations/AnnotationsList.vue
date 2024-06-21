<template>
  <div class="annotations-list t-overflow-auto">
    <div
      v-for="annotation in configuredAnnotations"
      :data-annotation-id="annotation.id"
      :key="annotation.id"
      class="item"
      :class="[
        't-py-2 t-px-3 t-mb-1 t-rounded-md',
        { 'hover:t-bg-gray-200 dark:hover:t-bg-gray-600 t-cursor-pointer': !isText(annotation) && !isActive(annotation) },
        { 't-bg-gray-300 dark:t-bg-gray-600 active': isActive(annotation) }
      ]"
      @click="isText(annotation) ? ()=>{} : toggle(annotation)"
    >
      
        <div v-if="!isVariant(annotation)" class="t-flex t-items-center t-space-x-2"> 
          <AnnotationIcon v-if="!isText(annotation)" :name="getIconName(annotation.body['x-content-type'])" />
          <span  v-html="annotation.body.value"/>
        </div>

        <div v-else v-for="variant in annotation.body.value" class="variant-item">
          <span v-if="variant.witness" v-html="variant.witness" class="witness"/>
          <span v-else  class="witness"> - </span>
          <span v-html="variant.entry"/>
        </div>
       
        <!-- eslint-disable -- https://eslint.vuejs.org/rules/no-v-html.html -->
    
        
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import AnnotationIcon from '@/components/annotations/AnnotationIcon.vue';

interface AnnotationTypesMapping {
  [key: string]: string | 'annotation'
 }

export interface Props {
  activeAnnotation: ActiveAnnotation
  configuredAnnotations: Annotation[],
  toggle: Function,
  types: any[]
}

const props = withDefaults(defineProps<Props>(), {
  activeAnnotation: () => <ActiveAnnotation>{},
  configuredAnnotations: () => <Annotation[]> [],
  toggle: () => null,
})

const annotationTypesMapping = computed<AnnotationTypesMapping>(() => (
  // it returns an object with a varying number of 'key', 'value' pairs
  props.types.reduce((prev, curr) => {
    prev[curr.name] = curr.annotationType || 'annotation';
    return prev;
  }, {})
));

function isActive(annotation: Annotation): boolean {
  return !!props.activeAnnotation[annotation.id];
}
function isText(annotation: Annotation): boolean {
  return annotationTypesMapping.value[annotation.body['x-content-type']] === 'text';
}
function getIconName(typeName: string): string {
  return props.types.find(({ name }) => name === typeName)?.icon || 'biPencilSquare';
}

function isVariant(annotation) {
  return annotation.body['x-content-type'] === 'Variant';
}

</script>


<style lang="scss" scoped>

.variant-item {
  display: flex;
  align-items: center;
}

.variant-item .witness {
  margin-right:25px;
}

</style>