'use strict';
// Конфиг Tailwind для build-step сборки (npm run build:css → css/tailwind.css).
// Раньше тема жила в js/tailwind.config.js и скармливалась runtime-CDN — теперь
// CSS генерируется заранее, CDN-скрипт из index.html убран.
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        mafia: {
          black: '#0c0a09',
          coal: '#1c1917',
          card: '#292524',
          border: '#44403c',
          gold: '#d4af37',
          goldLight: '#f0d875',
          blood: '#7f1d1d',
          bloodLight: '#991b1b',
          cream: '#faf8f5',
        },
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'serif'],
        sans: ['Manrope', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'scale-in': 'scaleIn 0.4s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
};
