export default defineAppConfig({
  ui: {
    colors: {
      primary: 'maroon',
      secondary: 'gold',
      neutral: 'stone'
    },
    button: {
      slots: {
        base: 'rounded-lg font-medium inline-flex items-center disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:opacity-75 aria-disabled:opacity-75 transition-colors'
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'text-white bg-maroon-800 hover:bg-maroon-700 active:bg-maroon-900 disabled:bg-maroon-800 aria-disabled:bg-maroon-800 outline-maroon-400/40 focus-visible:outline-3'
        }
      ]
    },
    card: {
      slots: {
        root: 'rounded-xl overflow-hidden shadow-sm'
      }
    },
    input: {
      slots: {
        root: 'w-full',
        base: 'w-full rounded-lg border-0 appearance-none placeholder:text-dimmed disabled:cursor-not-allowed disabled:opacity-75 transition-colors'
      }
    },
    select: {
      slots: {
        base: 'w-full'
      }
    },
    textarea: {
      slots: {
        root: 'w-full'
      }
    }
  }
})
