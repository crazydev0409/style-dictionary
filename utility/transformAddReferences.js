// utils/transformAddReferences.js

function addReferences(dictionary, references) {
  const updatedDictionary = { ...dictionary };

  for (const key in updatedDictionary) {
    updatedDictionary[`${key}-ref`] = references.pop();
  }

  return updatedDictionary;
}

module.exports = {
  transform: addReferences,
};
