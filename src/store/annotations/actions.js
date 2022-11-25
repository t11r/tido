import * as AnnotationUtils from 'src/utils/annotations';
import { request } from '@/utils/http';
import * as Utils from '@/utils';

export const addActiveAnnotation = ({ getters, rootGetters, dispatch }, id) => {
  const { activeAnnotations, annotations } = getters;
  const newActiveAnnotation = annotations.find((annotation) => annotation.id === id);

  if (!newActiveAnnotation || activeAnnotations[id]) {
    return;
  }

  const iconName = rootGetters['config/getIconByType'](newActiveAnnotation.body['x-content-type']);

  const activeAnnotationsList = { ...activeAnnotations };

  activeAnnotationsList[id] = newActiveAnnotation;

  dispatch('setActiveAnnotations', activeAnnotationsList);

  const selector = Utils.generateTargetSelector(newActiveAnnotation);
  const elements = (selector) ? [...document.querySelectorAll(selector)] : [];
  Utils.highlightTargets(selector, { operation: 'INC' });

  if (elements.length > 0) {
    Utils.addIcon(elements[0], newActiveAnnotation, iconName);
    elements[0].scrollIntoView({ behavior: 'smooth' });
  }
};

export const setActiveAnnotations = ({ commit }, activeAnnotations) => {
  commit('setActiveAnnotations', activeAnnotations);
};

export const setFilteredAnnotations = ({ commit, getters, rootGetters }, types) => {
  const { annotations } = getters;
  const activeContentType = rootGetters['config/activeContentType'];
  const filteredAnnotations = types.length === 0 ? annotations : annotations.filter(
    (annotation) => {
      const type = types.find(({ name }) => name === annotation.body['x-content-type']);
      // First we check if annotation fits to the current view
      if (!type) return false;

      // Next we check if annotation should always be displayed on the current content tab
      if (type?.displayWhen && type?.displayWhen === activeContentType) return true;

      // If the display is not dependent on displayWhen then we check if annotation's target exists in the content
      const selector = AnnotationUtils.generateTargetSelector(annotation);
      if (selector) {
        const el = document.querySelector(selector);
        if (el) {
          return true;
        }
      }

      return false;
    },
  );

  commit('setFilteredAnnotations', filteredAnnotations);
};

export const addHighlightAttributesToText = ({ getters }, dom) => {
  const { annotations } = getters;

  // Add range attributes
  [...dom.querySelectorAll('[data-target]:not([value=""])')]
    .map((el) => el.getAttribute('data-target').replace('_start', '').replace('_end', ''))
    .forEach((targetSelector) => Utils.addRangeHighlightAttributes(targetSelector, dom));

  // Add single attributes
  annotations.forEach((annotation) => {
    const { id } = annotation;
    const selector = Utils.generateTargetSelector(annotation);
    if (selector) {
      Utils.addHighlightToElements(selector, dom, id);
    }
  });
};

export const annotationLoaded = ({ commit }, annotations) => {
  commit('setAnnotations', annotations);
  commit('updateAnnotationLoading', false);
};

export const loadAnnotations = ({ commit }) => {
  commit('updateAnnotationLoading', true);
  commit('setAnnotations', []);
};

export const removeActiveAnnotation = ({ getters, dispatch }, id) => {
  const { activeAnnotations } = getters;

  const removeAnnotation = activeAnnotations[id];
  if (!removeAnnotation) {
    return;
  }

  const activeAnnotationsList = { ...activeAnnotations };

  delete activeAnnotationsList[id];
  dispatch('setActiveAnnotations', activeAnnotationsList);

  const selector = AnnotationUtils.generateTargetSelector(removeAnnotation);
  if (selector) {
    AnnotationUtils.highlightTargets(selector, { operation: 'DEC' });
    AnnotationUtils.removeIcon(removeAnnotation);
  }
};

export const resetAnnotations = ({ dispatch, getters }) => {
  const { annotations } = getters;

  annotations.forEach((annotation) => {
    const selector = AnnotationUtils.generateTargetSelector(annotation);
    if (selector) {
      AnnotationUtils.highlightTargets(selector, { level: -1 });
      AnnotationUtils.removeIcon(annotation);
    }
  });
  dispatch('setActiveAnnotations', {});
};

export const initAnnotations = async ({ dispatch }, url) => {
  try {
    const annotations = await request(url);

    if (!annotations.annotationCollection.first) {
      dispatch('annotationLoaded', []);
      return;
    }

    const current = await request(annotations.annotationCollection.first);
    if (current.annotationPage.items.length) {
      dispatch('annotationLoaded', current.annotationPage.items);
    }
  } catch (err) {
    dispatch('annotationLoaded', []);
  }
};

export const addHighlightHoverListeners = ({ dispatch, getters, rootGetters }) => {
  const { filteredAnnotations } = getters;
  const annotationIds = filteredAnnotations.reduce((acc, curr) => {
    const { id } = curr;
    const name = rootGetters['config/getIconByType'](curr.body['x-content-type']);

    acc[AnnotationUtils.stripAnnotationId(id)] = {
      value: curr.body.value,
      name,
    };
    return acc;
  }, {});

  document.querySelectorAll('[data-annotation]')
    .forEach((el) => {
      const childOtherNodes = [...el.childNodes].filter((x) => x.nodeName !== '#text').length;

      if (!childOtherNodes) {
        const classNames = [];
        el = AnnotationUtils.backTrackNestedAnnotations(el, classNames);
        const annotationClasses = [];

        // checks for duplicate class names.
        classNames
          .join(' ')
          .split(' ')
          .map((x) => annotationIds[x])
          .filter((x) => x)
          .reduce((acc, curr) => {
            if (!acc[curr.value]) {
              acc[curr.value] = true;
              annotationClasses.push(curr);
            }
            return acc;
          }, {});

        if (annotationClasses.length) {
          el.addEventListener(
            'mouseenter',
            () => {
              if (AnnotationUtils.isAnnotationSelected(el)) {
                AnnotationUtils.createTooltip.bind(this, el, annotationClasses)();
              }
            },
            false,
          );
          el.addEventListener(
            'mouseout',
            () => document.querySelectorAll('.annotation-tooltip').forEach((el) => el.remove()),
            false,
          );
        }
      }
    });
};

export const addHighlightClickListeners = ({ dispatch, getters }) => {
  const textEl = document.querySelector('#text-content>div>*');

  if (!textEl) return;

  textEl.addEventListener('click', ({ target }) => {
    // The click event handler works like this:
    // When clicking on the text we pick the whole part of the text which belongs to the highest parent annotation.
    // Since the annotations can be nested we avoid handling each of them separately
    // and select/deselect the whole cluster at once.
    // The actual click target decides whether it should be a selection or a deselection.

    // First we make sure to have a valid target.
    // Although we receive a target from the event it can be a regular HTML element within the annotation.
    // So we try to find it's nearest parent element that is marked as annotation element.
    if (!target.dataset.annotation) {
      target = getNearestParentAnnotation(target);
    }

    if (!target) {
      return;
    }

    // Next we look up which annotations need to be selected
    let annotationIds = {};

    getValuesFromAttribute(target, 'data-annotation-ids').forEach((value) => annotationIds[value] = true);
    annotationIds = discoverParentAnnotationIds(target, annotationIds);
    annotationIds = discoverChildAnnotationIds(target, annotationIds);

    const { filteredAnnotations } = getters;

    // We check the highlighting level to determine whether to select or deselect.
    // TODO: it might be better to check the activeAnnotations instead
    const targetIsSelected = parseInt(target.getAttribute('data-annotation-level'), 10) > 0;

    Object.keys(annotationIds).forEach((id) => {
      // We need to check here if the right annotations panel tab is active
      // a.k.a. it exists in the current filteredAnnotations
      const annotation = filteredAnnotations.find((filtered) => filtered.id === id);
      if (annotation) {
        if (targetIsSelected) {
          dispatch('removeActiveAnnotation', id);
        } else {
          dispatch('addActiveAnnotation', id);
        }
      }
    });
  });

  function getNearestParentAnnotation(element) {
    const parent = element.parentElement;

    if (!parent) return null;

    if (parent.dataset?.annotation) {
      return parent;
    }
    return getNearestParentAnnotation(parent);
  }

  function getValuesFromAttribute(element, attribute) {
    const value = element.getAttribute(attribute);
    return value ? value.split(' ') : [];
  }

  function discoverParentAnnotationIds(el, annotationIds = {}) {
    const parent = el.parentElement;
    if (parent && parent.id !== 'text-content') {
      getValuesFromAttribute(parent, 'data-annotation-ids').forEach((value) => annotationIds[value] = true);
      return discoverParentAnnotationIds(parent, annotationIds);
    }
    return annotationIds;
  }

  function discoverChildAnnotationIds(el, annotationIds = {}) {
    const { children } = el;

    [...children].forEach((child) => {
      if (child.dataset.annotation) {
        getValuesFromAttribute(child, 'data-annotation-ids').forEach((value) => annotationIds[value] = true);
        annotationIds = discoverChildAnnotationIds(child, annotationIds);
      }
    });
    return annotationIds;
  }
};

export const selectAll = ({ getters, dispatch }) => {
  const { filteredAnnotations, activeAnnotations } = getters;
  filteredAnnotations.forEach(({ id }) => !activeAnnotations[id] && dispatch('addActiveAnnotation', id));
};

export const selectNone = ({ getters, dispatch }) => {
  const { filteredAnnotations, activeAnnotations } = getters;
  filteredAnnotations.forEach(({ id }) => activeAnnotations[id] && dispatch('removeActiveAnnotation', id));
};
