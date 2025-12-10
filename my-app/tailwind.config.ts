// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        paintpro: {
          lightgreen: '#C1FF72', // Replace with your Figma primary hex
          primarygreen: '#7ED957',
          secondarygreen: '#00BF63',
          darkgreen: '18510F',
          grey: '545454',

        }
      },
      fontFamily: {
        // Add your Figma fonts here
      }
    },
  },
  // ... rest of config
};
export default config;