const { ipcRenderer } = require('electron');
const path = require('path');

const dirPathInput = document.getElementById('dirPath');
const loadDirButton = document.getElementById('loadDir');

const toggleViewButton = document.getElementById('toggleView');
const fileListContainer = document.getElementById('fileListContainer');
const fileList = document.getElementById('fileList');
const fileGrid = document.getElementById('fileGrid');

const selectedFileSpan = document.getElementById('selectedFile');
const directoryView = document.getElementById('directoryView');
const currentTagView = document.getElementById('currentTagView');
const backToDirButton = document.getElementById('backToDir');

const tagList = document.getElementById('tagList');
const tagView = document.getElementById('tagView');
const tagSection = document.getElementById('tagSection');
let newTagInput = document.getElementById('newTag');
let addTagButton = document.getElementById('addTag');
let tagSuggestion = document.getElementById('tagSuggestion');
const tagLocationSpan = document.getElementById('tagLocation');
const taggedFileList = document.getElementById('taggedFileList');
const tagMenu = document.getElementById('tagMenu');

let currentFilePath = '';
let currentTags = [];
let tagColors = {};
let isGridView = false;
let allTags = [];
let activeFilters = new Set();

function getTagColor(tag) {
  if (!tagColors[tag]) {
    tagColors[tag] = `hsl(${Math.random() * 360}, 70%, 80%)`;
  }
  return tagColors[tag];
}

async function updateTagMenu() {
  allTags = await ipcRenderer.invoke('get-all-tags');
  tagMenu.innerHTML = '';
  allTags.forEach((tag) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="tag" style="background-color: ${getTagColor(
      tag
    )}">${tag}</span>`;
    li.addEventListener('click', () => toggleTagFilter(tag));
    tagMenu.appendChild(li);
  });
  ipcRenderer.invoke('save-tag-colors', tagColors);
}

async function showFilesWithTag(tag) {
  const files = await ipcRenderer.invoke('get-files-with-tag', tag);
  currentTagView.textContent = tag;
  taggedFileList.innerHTML = '';
  files.forEach((file) => {
    const li = document.createElement('li');
    li.textContent = path.basename(file);
    li.addEventListener('click', () => loadFileTags(file));
    taggedFileList.appendChild(li);
  });
  directoryView.style.display = 'none';
  tagView.style.display = 'block';
}

backToDirButton.addEventListener('click', () => {
  tagView.style.display = 'none';
  directoryView.style.display = 'block';
});

async function loadDirectory(dirPath) {
  console.error('LOADING DIRECTORY');
  await applyFilters();
  console.error('Updating tag menu');
  updateTagMenu();
  ipcRenderer.invoke('save-last-directory', dirPath);
}

async function applyFilters() {
  const dirPath = dirPathInput.value;
  const files = await ipcRenderer.invoke('read-directory', dirPath);
  const filteredFiles = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const tags = await ipcRenderer.invoke('read-file-tags', filePath);
    if (
      activeFilters.size === 0 ||
      Array.from(activeFilters).every((filter) => tags.includes(filter))
    ) {
      filteredFiles.push(file);
    }
  }

  console.error('RENDERING FILES');
  await renderFiles(filteredFiles, dirPath);
}

async function toggleTagFilter(tag) {
  if (activeFilters.has(tag)) {
    activeFilters.delete(tag);
  } else {
    activeFilters.add(tag);
  }
  updateActiveFiltersDisplay();
  await applyFilters();
}

function updateActiveFiltersDisplay() {
  const activeFiltersContainer = document.getElementById('activeFilters');
  activeFiltersContainer.innerHTML = '';
  activeFilters.forEach((tag) => {
    const tagElement = document.createElement('span');
    tagElement.className = 'tag';
    tagElement.style.backgroundColor = getTagColor(tag);
    tagElement.innerHTML = `
      ${tag}
      <button class="remove-filter" data-tag="${tag}">x</button>
    `;
    tagElement
      .querySelector('.remove-filter')
      .addEventListener('click', () => toggleTagFilter(tag));
    activeFiltersContainer.appendChild(tagElement);
  });
}

async function renderFiles(files, dirPath) {
  // if (isGridView) {
  //   await renderGridView(files, dirPath);
  // } else {
  //   await renderListView(files, dirPath);
  // }
  await renderListView(files, dirPath);
  await renderGridView(files, dirPath);
}

async function renderListView(files, dirPath) {
  fileList.innerHTML = '';
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const tags = await ipcRenderer.invoke('read-file-tags', filePath);
    console.error(tags);
    const listItem = createListViewItem(file, tags, filePath);
    fileList.appendChild(listItem);
  }
}
async function renderGridView(files, dirPath) {
  fileGrid.innerHTML = '';
  const batchSize = 5;
  const batches = Math.ceil(files.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const batch = files.slice(i * batchSize, (i + 1) * batchSize);
    const filePaths = batch.map((file) => path.join(dirPath, file));
    const thumbnails = await ipcRenderer.invoke(
      'generate-thumbnails',
      filePaths
    );

    for (const { filePath, thumbnailPath } of thumbnails) {
      const file = path.basename(filePath);
      const tags = await ipcRenderer.invoke('read-file-tags', filePath);
      const gridItem = createGridViewItem(file, filePath, thumbnailPath, tags);
      fileGrid.appendChild(gridItem);
    }
  }
}

function createListViewItem(file, tags, filePath) {
  const li = document.createElement('li');
  li.setAttribute('data-file-path', filePath);

  li.innerHTML = `
      <span class="file-name">${file}</span>
      <div class="tag-container" data-file-path="${filePath}">
        ${renderTagsHtml(tags)}
      </div>
    `;
  li.addEventListener('click', () => loadFileTags(filePath));
  return li;
}

function createGridViewItem(file, filePath, thumbnailPath, tags) {
  const gridItem = document.createElement('div');
  gridItem.className = 'grid-item';
  gridItem.setAttribute('data-file-path', filePath);

  if (thumbnailPath) {
    gridItem.innerHTML = `<img src="file://${thumbnailPath}" alt="${file}">`;
  } else {
    gridItem.innerHTML = `<div class="no-preview">No Preview</div>`;
  }

  gridItem.innerHTML += `
    <div class="file-name">${file}</div>
    <div class="tag-container" data-file-path="${filePath}">
      ${renderTagsHtml(tags)}
    </div>
  `;
  gridItem.addEventListener('click', () => loadFileTags(filePath));
  return gridItem;
}

function renderTagsHtml(tags) {
  return tags
    .map(
      (tag) =>
        `<span class="tag" style="background-color: ${getTagColor(
          tag
        )}">${tag}</span>`
    )
    .join('');
}

function updateFileTagsUI(filePath, tags) {
  console.error('updateFileTagsUI');
  const tagContainers = document.querySelectorAll(
    `.tag-container[data-file-path="${filePath}"]`
  );

  tagContainers.forEach((container) => {
    container.innerHTML = renderTagsHtml(tags);
  });
}

toggleViewButton.addEventListener('click', async () => {
  isGridView = !isGridView;
  fileList.style.display = isGridView ? 'none' : 'block';
  fileGrid.style.display = isGridView ? 'grid' : 'none';

  // Hide the tagSection when switching views
  document.getElementById('tagSection').style.display = 'none';

  if (isGridView && fileGrid.children.length === 0) {
    const dirPath = dirPathInput.value;
    const files = await ipcRenderer.invoke('read-directory', dirPath);
    await renderGridView(files, dirPath);
  }
});

loadDirButton.addEventListener('click', () => {
  const dirPath = dirPathInput.value;
  loadDirectory(dirPath);
});

// Hide the tagSection when clicking outside of it
// document.addEventListener('click', (event) => {
//   const tagSection = document.getElementById('tagSection');
//   const tagSectionContainer = document.getElementById('tagSectionContainer');
//   if (
//     !tagSection.contains(event.target) &&
//     !event.target.closest('li, .grid-item')
//   ) {
//     tagSection.style.display = 'none';
//     tagSectionContainer.innerHTML = '';
//   }
// });

let currentOpenTagSection = null;
// When a file is clicked, we load information about it and the ability to add new tags
async function loadFileTags(filePath) {
  currentFilePath = filePath;
  currentTags = await ipcRenderer.invoke('read-file-tags', filePath);
  selectedFileSpan.textContent = filePath;

  // Find the clicked item
  let clickedItem = null;
  if (isGridView) {
    clickedItem = Array.from(fileGrid.children).find(
      (item) => item.getAttribute('data-file-path') === filePath
    );
  } else {
    clickedItem = Array.from(fileList.children).find(
      (item) => item.getAttribute('data-file-path') === filePath
    );
  }

  if (!clickedItem) {
    console.error('Clicked item not found');
    return;
  }

  // Close the previously opened tagSection if it exists
  if (currentOpenTagSection) {
    currentOpenTagSection.remove();
  }

  // Create a new tagSectionContainer
  const tagSectionContainer = document.createElement('div');
  tagSectionContainer.id = 'tagSectionContainer';

  // Clone the tagSection and append it to the new container
  const tagSectionClone = document.getElementById('tagSection').cloneNode(true);
  tagSectionClone.style.display = 'block';
  tagSectionContainer.appendChild(tagSectionClone);

  // Insert the container after the clicked item
  clickedItem.parentNode.insertBefore(
    tagSectionContainer,
    clickedItem.nextSibling
  );

  // Update the current open tagSection
  currentOpenTagSection = tagSectionContainer;

  // Re-attach event listeners to the cloned elements
  attachTagSectionEventListeners(tagSectionClone);

  renderTags();
  updateTagLocation();
}

function attachTagSectionEventListeners(tagSection) {
  newTagInput = tagSection.querySelector('#newTag');
  addTagButton = tagSection.querySelector('#addTag');
  tagSuggestion = tagSection.querySelector('#tagSuggestion');

  newTagInput.addEventListener('input', handleNewTagInput);
  newTagInput.addEventListener('keydown', handleNewTagKeydown);
  addTagButton.addEventListener('click', handleAddTagButtonClick);
}

function handleNewTagInput(event) {
  const inputValue = newTagInput.value.trim().toLowerCase();
  const matchingTags = allTags.filter((tag) =>
    tag.toLowerCase().startsWith(inputValue)
  );
  console.error(newTagInput.value);
  if (matchingTags.length > 0 && inputValue.length > 0) {
    const suggestion = matchingTags[0];
    tagSuggestion.textContent = suggestion;
    tagSuggestion.style.display = 'inline';
    tagSuggestion.style.backgroundColor = getTagColor(suggestion);
  } else {
    tagSuggestion.textContent = '';
    tagSuggestion.style.display = 'none';
  }
}

function handleNewTagKeydown(e) {
  if (e.key === 'Tab' && tagSuggestion.textContent) {
    e.preventDefault();
    newTagInput.value = tagSuggestion.textContent;
    tagSuggestion.textContent = '';
    tagSuggestion.style.display = 'none';
  }
}

async function handleAddTagButtonClick() {
  const newTag = newTagInput.value.trim();
  console.error('WORKS', newTag, newTagInput.value);
  if (newTag && !currentTags.includes(newTag)) {
    currentTags.push(newTag);
    await ipcRenderer.invoke('write-file-tags', currentFilePath, currentTags);
    newTagInput.value = '';
    tagSuggestion.textContent = '';
    tagSuggestion.style.display = 'none';
    renderTags();
    updateFileTagsUI(currentFilePath, currentTags);
    updateTagMenu();
  }
}

function renderTags() {
  const tagList = currentOpenTagSection.querySelector('#tagList');
  tagList.innerHTML = '';
  currentTags.forEach((tag) => {
    const li = document.createElement('li');
    li.className = 'existingTagsContainer';

    li.innerHTML = `
      <span class="tag" style="background-color: ${getTagColor(tag)}">
        ${tag}
        <button class="delete-tag" data-tag="${tag}">x</button>
      </span>
    `;
    li.querySelector('.delete-tag').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTag(tag);
    });
    tagList.appendChild(li);
  });
}

async function deleteTag(tagToDelete) {
  currentTags = currentTags.filter((tag) => tag !== tagToDelete);
  await ipcRenderer.invoke('write-file-tags', currentFilePath, currentTags);
  renderTags();
  updateFileTagsUI(currentFilePath, currentTags);
  updateTagMenu();
}

async function updateTagLocation() {
  const tagFilePath = await ipcRenderer.invoke('get-tags-file-path');
  const tagLocationSpan = currentOpenTagSection.querySelector('#tagLocation');
  if (tagLocationSpan) {
    tagLocationSpan.textContent = tagFilePath;
  }
}

/* For searching through existing tags */
newTagInput.addEventListener('input', handleNewTagInput);

newTagInput.addEventListener('keydown', handleNewTagKeydown);

addTagButton.addEventListener('click', handleAddTagButtonClick);

// Initialize tag location, menu, and load last directory
async function initialize() {
  updateTagLocation();
  tagColors = await ipcRenderer.invoke('get-tag-colors');
  updateTagMenu();
  const lastDirectory = await ipcRenderer.invoke('get-last-directory');
  if (lastDirectory) {
    dirPathInput.value = lastDirectory;
    await loadDirectory(lastDirectory);
  }
}

// Initialize tag location and menu
// updateTagLocation();
// updateTagMenu();
initialize();
