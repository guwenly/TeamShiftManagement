const fs = require('fs');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

console.log('Starting CSS build process...');

const tailwindConfig = require('./tailwind.config.js');

const css = `
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

${fs.readFileSync('static/css/styles.css', 'utf8')}
`;

console.log('Read styles.css file and added Tailwind imports');

postcss([tailwindcss(tailwindConfig), autoprefixer])
  .process(css, { from: undefined, to: 'static/css/tailwind.css' })
  .then(result => {
    fs.writeFileSync('static/css/tailwind.css', result.css);
    if (result.map) {
      fs.writeFileSync('static/css/tailwind.css.map', result.map.toString());
    }
    console.log('Tailwind CSS built successfully');
  })
  .catch(error => {
    console.error('Error building Tailwind CSS:', error);
  });
