//
// THIS WORKS TO CREATE 4 THEME FILES
//

const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");
const StyleDictionary = require("style-dictionary");
const { registerTransforms } = require("@tokens-studio/sd-transforms");
const concat = require("concat");

registerTransforms(StyleDictionary);

const removeNonNumeric = (str) => {
  if (!str) {
    return 0;
  }
  return Number(str.replace(/[^0-9.]/g, "")) || 0;
};
const formatBoxShadow = ({ x, y, blur, spread, color }) =>
  `${x}px ${y}px ${blur}px ${removeNonNumeric(spread)}px ${color}`;

const registerTransform = (type, name, matcher, transformer) =>
  StyleDictionary.registerTransform({
    type,
    name,
    matcher,
    transformer,
    transitive: true,
  });
const selectorMap = {
  product_dark: ".dark",
  product_light: ":root, .light",
  attendee_light: ".attendee_light",
  attendee_dark: ".attendee_dark",
};
const specifySelector = (selector) => {
  for (let key in selectorMap) {
    if (selector === key) {
      return selectorMap[key];
    }
  }

  return null;
};

const transforms = [
  [
    "value",
    "figmaCalc",
    ({ value }) => typeof value === "string" && value.includes("*"),
    ({ value }) => {
      const optimizeNumber = (num) =>
        Math.round(Math.round(num * 100) / 10) / 10;
      const [a, b] = value.split("*").map(removeNonNumeric);
      return `${optimizeNumber(a * b)}px`;
    },
  ],
  [
    "value",
    "heightPercent",
    ({ value }) => typeof value === "string" && value.includes("%"),
    (props) =>
      props?.type === "lineHeights" ? props?.description : props.value,
  ],
  [
    "value",
    "contentTypography",
    ({ type }) => type === "typography",
    ({ value }) => {
      const { fontSize, lineHeight, fontFamily } = value;
      return fontSize && lineHeight && fontFamily
        ? `400 ${fontSize}/${lineHeight} ${fontFamily}`
        : undefined;
    },
  ],
  [
    "value",
    "contentBoxShadow",
    ({ type }) => type === "boxShadow",
    ({ value }) =>
      value && Array.isArray(value)
        ? value.map(formatBoxShadow).join(", ")
        : value !== null && typeof value === "object"
          ? formatBoxShadow(value)
          : value,
  ],
];

transforms.forEach((args) => registerTransform(...args));
const kebabToCamelCase = (str) =>
  str.replace(/-./g, (match) => match.charAt(1).toUpperCase());

// Register a custom name transform to convert kebab-case to camelCase
StyleDictionary.registerTransform({
  name: "name/cti/camelCase",
  type: "name",
  transformer: (prop) => {
    return kebabToCamelCase(prop.name);
  },
});

// Register a custom format to use the camelCase transform
StyleDictionary.registerFormat({
  name: "tokens/nested/camelCase",
  formatter: function ({ dictionary }) {
    return JSON.stringify(
      dictionary.allProperties.reduce((acc, prop) => {
        const keys = prop.path.map(kebabToCamelCase);
        keys.reduce((a, key, idx) => {
          if (idx === keys.length - 1) {
            a[key] = prop.value;
          } else {
            a[key] = a[key] || {};
          }
          return a[key];
        }, acc);
        return acc;
      }, {}),
      null,
      2
    );
  },
});
StyleDictionary.registerTransformGroup({
  name: "customCss",
  transforms: StyleDictionary.transformGroup["css"].concat([
    "heightPercent",
    "figmaCalc",
    "attribute/cti",
    "name/cti/kebab",
    "time/seconds",
    "content/icon",
    "color/css",
    "contentTypography",
    "contentBoxShadow",
  ]),
});

const excludedFilesForEachTheme = {
  product_dark: ["dark", "semantics/mutable", "semantics/color attendee"],
  product_light: ["dark", "semantics/mutable"],
  attendee_light: ["light", "semantics/color attendee"],
  attendee_dark: ["light"],
};

const metadata = Object.values(
  JSON.parse(readFileSync("tokens/$metadata.json", "utf-8"))
).flat();

const themes = Object.keys(excludedFilesForEachTheme).reduce((acc, theme) => {
  acc[theme] = metadata.filter(
    (item) => !excludedFilesForEachTheme[theme].includes(item)
  );
  return acc;
}, {});
Object.entries(themes)
  .map(([name, tokensets]) => ({
    source: tokensets.map((tokenset) => `tokens/${tokenset}.json`),
    platforms: {
      css: {
        transformGroup: "customCss",
        prefix: "--rolo",
        buildPath: `css/`,
        files: [
          {
            destination: `${name}.css`,
            format: "css/variables",
            options: {
              selector: specifySelector(name),
            },
          },
        ],
      },
      json: {
        transformGroup: "tokens-studio",
        prefix: "",
        buildPath: "doc/",
        files: [
          {
            destination: `${name}.json`,
            format: "json/nested",
            options: {
              selector: specifySelector(name),
              showFileHeader: false,
            },
          },
        ],
      },
    },
  }))
  .forEach((cfg) => {
    const sd = StyleDictionary.extend(cfg);
    sd.cleanAllPlatforms();
    sd.buildAllPlatforms();
  });

// const outputFilePath = "css/combined.css"; // specify the path of the output file
// const inputFilePaths = Object.keys(selectorMap).map((key) => `css/${key}.css`); // specify the paths of the input files

// concat(inputFilePaths, outputFilePath)
//   .then(() => console.log("CSS files were concatenated successfully"))
//   .catch((error) => console.error("Failed to concatenate CSS files:", error));

// const directoryPath = join(__dirname, "doc");
// const outputJsonPath = join(__dirname, "doc/combined.json");

// const filenames = Object.keys(selectorMap).map((key) => `${key}.json`);

// const mergedContent = filenames
//   .map((filename) => {
//     const filePath = join(directoryPath, filename);
//     const fileContent = readFileSync(filePath, "utf-8");
//     const jsonContent = JSON.parse(fileContent);
//     jsonContent.nameOfFile = filename.replace(".json", "");
//     return jsonContent;
//   })
//   .reduce((acc, content) => {
//     acc[content.nameOfFile] = content;
//     return acc;
//   }, {});

// const mergedContentString = JSON.stringify(mergedContent, null, 2);

// writeFileSync(outputJsonPath, mergedContentString);
