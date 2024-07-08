<template>
    <div class="translation-text">
        <p v-html="content">  </p>
    </div>
</template>


<script setup lang="ts">
import {
  computed, ref, watch,
} from 'vue';
import { request } from '@/utils/http';

const props = defineProps({
  url: String,
  type: String,
  fontSize: Number,
});

const content = ref('');


async function loadTranslationContent(url: string) {
    const data = await request(url);
    content.value = data;
}
watch(
  () => props.url,
  loadTranslationContent,
  { immediate: true },
);

</script>


<style lang="scss" scoped>

.translation-text {
  width: 280px;  
  margin-left:3%;
  margin-top: 10px;
}

</style>