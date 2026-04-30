import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  DesignSpec,
  InternalContextDocument,
  ReferenceImage,
  SpecSection,
  SpecSectionId,
} from '../types/spec';
import { createEmptySections } from '../lib/constants';
import { stripLegacyExistingDesignSection } from '../lib/spec-legacy';
import { STORAGE_KEYS } from '../lib/storage-keys';
import { generateId, now } from '../lib/utils';

interface SpecStore {
  spec: DesignSpec;
  /** Transient (not persisted): section currently having an image captured */
  capturingImage: SpecSectionId | null;
  setCapturingImage: (sectionId: SpecSectionId | null) => void;
  createNewCanvas: (title?: string) => void;
  setTitle: (title: string) => void;
  updateSection: (sectionId: SpecSectionId, content: string) => void;
  setInternalContextDocument: (doc: InternalContextDocument | undefined) => void;
  /** Clears body and images for one section; other sections unchanged. */
  resetSectionContent: (sectionId: SpecSectionId) => void;
  addImage: (sectionId: SpecSectionId, image: ReferenceImage) => void;
  updateImageDescription: (sectionId: SpecSectionId, imageId: string, description: string) => void;
  removeImage: (sectionId: SpecSectionId, imageId: string) => void;
  loadCanvas: (spec: DesignSpec) => void;
}

function createNewDesignSpec(title: string = 'Untitled Canvas'): DesignSpec {
  return {
    id: generateId(),
    title,
    sections: createEmptySections(),
    createdAt: now(),
    lastModified: now(),
    version: 1,
  };
}

export const useSpecStore = create<SpecStore>()(
  persist(
    (set) => ({
      spec: createNewDesignSpec(),
      capturingImage: null,
      setCapturingImage: (sectionId) => set({ capturingImage: sectionId }),
      createNewCanvas: (title) =>
        set({ spec: createNewDesignSpec(title) }),

      setTitle: (title) =>
        set((state) => ({
          spec: { ...state.spec, title, lastModified: now() },
        })),

      updateSection: (sectionId, content) =>
        set((state) => {
          const existingSection = state.spec.sections[sectionId];
          return {
            spec: {
              ...state.spec,
              lastModified: now(),
              sections: {
                ...state.spec.sections,
                [sectionId]: {
                  id: sectionId,
                  content,
                  images: existingSection?.images ?? [],
                  lastModified: now(),
                },
              },
            },
          };
        }),

      setInternalContextDocument: (doc) =>
        set((state) => ({
          spec: {
            ...state.spec,
            internalContextDocument: doc,
            lastModified: now(),
          },
        })),

      resetSectionContent: (sectionId) =>
        set((state) => {
          const touched = now();
          return {
            spec: {
              ...state.spec,
              lastModified: touched,
              sections: {
                ...state.spec.sections,
                [sectionId]: {
                  id: sectionId,
                  content: '',
                  images: [],
                  lastModified: touched,
                },
              },
            },
          };
        }),

      addImage: (sectionId, image) =>
        set((state) => {
          const existingSection = state.spec.sections[sectionId];
          return {
            spec: {
              ...state.spec,
              lastModified: now(),
              sections: {
                ...state.spec.sections,
                [sectionId]: {
                  id: sectionId,
                  content: existingSection?.content ?? '',
                  images: [...(existingSection?.images ?? []), image],
                  lastModified: now(),
                },
              },
            },
          };
        }),

      updateImageDescription: (sectionId, imageId, description) =>
        set((state) => {
          const existingSection = state.spec.sections[sectionId];
          if (!existingSection) return state;
          return {
            spec: {
              ...state.spec,
              lastModified: now(),
              sections: {
                ...state.spec.sections,
                [sectionId]: {
                  ...existingSection,
                  images: existingSection.images.map((img) =>
                    img.id === imageId ? { ...img, description } : img
                  ),
                  lastModified: now(),
                },
              },
            },
          };
        }),

      removeImage: (sectionId, imageId) =>
        set((state) => {
          const existingSection = state.spec.sections[sectionId];
          if (!existingSection) return state;
          return {
            spec: {
              ...state.spec,
              lastModified: now(),
              sections: {
                ...state.spec.sections,
                [sectionId]: {
                  ...existingSection,
                  images: existingSection.images.filter(
                    (img) => img.id !== imageId
                  ),
                  lastModified: now(),
                },
              },
            },
          };
        }),

      loadCanvas: (spec) => {
        const activeSpec = stripLegacyExistingDesignSection(spec);
        // Ensure all required sections exist when loading a spec
        const normalizedSections: Record<SpecSectionId, SpecSection> = {
          ...createEmptySections(),
        };
        Object.keys(activeSpec.sections).forEach((key) => {
          const sectionId = key as SpecSectionId;
          if (activeSpec.sections[sectionId]) {
            normalizedSections[sectionId] = activeSpec.sections[sectionId];
          }
        });
        set({ spec: { ...activeSpec, sections: normalizedSections } });
      },
    }),
    {
      name: STORAGE_KEYS.ACTIVE_CANVAS,
      version: 1,
      partialize: (state) => ({ spec: state.spec }),
      migrate: (persisted: unknown) => {
        const state = persisted as { spec?: DesignSpec };
        if (state?.spec?.sections) {
          // Ensure active section keys exist; retired legacy sections are dropped on load.
          const emptySections = createEmptySections();
          state.spec = stripLegacyExistingDesignSection({
            ...state.spec,
            sections: { ...emptySections, ...state.spec.sections },
          });
        }
        return state;
      },
    }
  )
);
