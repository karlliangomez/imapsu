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
          class: 'text-maroon-950 bg-gold-400 hover:bg-gold-500 active:bg-gold-500 disabled:bg-gold-400 aria-disabled:bg-gold-400 outline-gold-400/40 focus-visible:outline-3'
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
        base: 'w-full rounded-lg border-0 appearance-none placeholder:text-dimmed disabled:cursor-not-allowed disabled:opacity-75 transition-colors'
      }
    }
  }
})
