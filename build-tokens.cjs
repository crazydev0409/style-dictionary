const fs = require("fs");
const path = require("path");
const StyleDictionary = require("style-dictionary");
const { registerTransforms } = require("@tokens-studio/sd-transforms");

registerTransforms(StyleDictionary);

const removeNonNumeric = (str) => {

  if (!str) {
    return 0;
  }
  return str.replace(/[^0-9.-]/g, "") || 0;
};

const formatBoxShadow = ({ x, y, blur, spread, color }) =>
  `${x}px ${y}px ${blur}px ${removeNonNumeric(spread)}px ${color}`;

const makeVariable = (value) =>
  value
    .replace(/{/, "")
    .replace(/}/, "")
    .replace(/\./g, "-")
    .replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

const registerTransform = (type, name, matcher, transformer) =>
  StyleDictionary.registerTransform({
    type,
    name,
    matcher,
    transformer,
    transitive: true,
  });

const transforms = [
  [
    "value",
    "figmaCalc",
    ({ value }) => typeof value === "string" && value.includes("*"),
    ({ value }) => {
      const optimizeNumber = (num) => Math.round(num * 10) / 10;
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
        ? `inset ${value.map(formatBoxShadow).join(", ")}`
        : value && typeof value === "object"
          ? `inset ${formatBoxShadow(value)}`
          : `inset ${value}`,
  ],
];

transforms.forEach((args) => registerTransform(...args));

const kebabToCamelCase = (str) =>
  str.replace(/-./g, (match) => match.charAt(1).toUpperCase());

const selectorMap = {
  dark: ".dark",
  light: ":root, .light",
  attendee: ".attendee",
  mutable: ".dark",
  root: ":root",
};

const specifySelector = (selector) => selectorMap[selector] || null;

// Exclusion constants to ref the files to exlcude
const excludeDark = "dark";
const excludeLight = "light";
const excludeSemanticsMutable = "semantics/mutable";
const excludeSemanticsColorAttendee = "semantics/color attendee";
const excludeSemanticsColor = "semantics/color";
const excludeSemanticsAttendee = "semantics/attendee";
const excludeSemanticsShadow = "semantics/shadow";

const excludedFiles = [
  excludeSemanticsColor,
  excludeSemanticsColorAttendee,
  excludeSemanticsMutable,
  excludeSemanticsShadow,
];

const excludedFilesForEachTheme = {
  light: [excludeDark, excludeSemanticsMutable, excludeSemanticsColorAttendee],
  dark: [excludeLight, excludeSemanticsColorAttendee, excludeSemanticsMutable],
  attendee: [excludeSemanticsMutable],
  mutable: [excludeSemanticsColorAttendee],
  root: [excludeSemanticsAttendee, excludeSemanticsMutable],
};

const prefix = "--rolo";
const cssPath = "css/";
const jsonPath = "doc/";

// Register custom name transform to convert kebab-case to camelCase
StyleDictionary.registerTransform({
  name: "name/cti/camelCase",
  type: "name",
  transformer: (prop) => kebabToCamelCase(prop.name),
});

StyleDictionary.registerFormat({
  name: "css/variables",
  formatter: ({ dictionary, options }) => {
    const { selector = ":root", outputReferences, prefix } = options;
    let output = `${selector} {\n`;
    dictionary.allProperties.forEach((prop) => {
      if (
        outputReferences &&
        prop.original.value &&
        prop.original.value !== prop.value &&
        excludedFiles.some((path) => prop.filePath.includes(path))
      ) {
        output += `  --${prop.name}: var(${prefix}-${makeVariable(prop.original.value)});\n`;
      } else {
        output += `  --${prop.name}: ${prop.value};\n`;
      }
    });

    output += `}\n`;

    return output;
  },
});

// Register custom format to use the camelCase transform
StyleDictionary.registerFormat({
  name: "json/nested/camelCase",
  formatter: ({ dictionary }) =>
    JSON.stringify(
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
    ),
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

const metadata = Object.values(
  JSON.parse(fs.readFileSync("tokens/$metadata.json", "utf-8"))
).flat();

const themes = Object.keys(excludedFilesForEachTheme).reduce((acc, theme) => {
  acc[theme] = metadata.filter(
    (item) => !excludedFilesForEachTheme[theme].includes(item)
  );
  return acc;
}, {});

if (fs.existsSync("css")) {
  fs.readdirSync(cssPath).forEach((file) => {
    fs.unlinkSync(path.join(cssPath, file));
  });
}

Object.entries(themes)
  .map(([name, tokensets]) => ({
    source: tokensets.map((tokenset) => `tokens/${tokenset}.json`),
    platforms: {
      css: {
        transformGroup: "customCss",
        prefix: prefix,
        buildPath: cssPath,
        files: [
          {
            destination: `${name}.css`,
            format: "css/variables",
            filter: ({ filePath }) =>
              filePath.includes(name) ||
              (name === "root" &&
                !["light", "dark"].some((theme) => filePath.includes(theme))),
            options: {
              outputReferences: true,
              selector: specifySelector(name),
              prefix: prefix,
            },
          },
        ],
      },
      json: {
        transformGroup: "tokens-studio",
        prefix: "",
        buildPath: jsonPath,
        files: [
          {
            destination: `${name}.json`,
            format: "json/nested/camelCase",
            filter: () => name !== "root",
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

const combineJSONFiles = async () => {
  try {
    delete selectorMap.root;
    const directoryPath = path.join(__dirname, "doc");
    const outputJsonPath = path.join(__dirname, jsonPath + "combined.json");
    const filenames = Object.keys(selectorMap).map((key) => `${key}.json`);
    const mergedContent = filenames
      .map((filename) => {
        const filePath = path.join(directoryPath, filename);
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const jsonContent = JSON.parse(fileContent);
        jsonContent.nameOfFile = filename.replace(".json", "");
        return jsonContent;
      })
      .reduce((acc, content) => {
        acc[content.nameOfFile] = content;
        return acc;
      }, {});
    const mergedContentString = JSON.stringify(mergedContent, null, 2);
    fs.writeFileSync(outputJsonPath, mergedContentString);
    filenames.forEach((file) => fs.unlinkSync(path.join(directoryPath, file)));
  } catch (error) {
    console.error("Error combining JSON files:", error);
  }
};
// Run the function
combineJSONFiles();
