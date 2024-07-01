// utils/transformExtractReferences.js

function extractReferences(dictionary) {
  const references = [];

  for (const key in dictionary) {
    if (typeof dictionary[key] === "object" && dictionary[key].value) {
      references.push(dictionary[key].value);
    }
  }

  return references;
}

module.exports = {
  transform: extractReferences,
};
