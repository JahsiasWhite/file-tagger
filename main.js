const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');

let mainWindow;
const tagsFilePath = path.join(app.getPath('userData'), 'fileTags.json');
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function readTagsFile() {
  try {
    const data = await fs.readFile(tagsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { tagColors: {} };
  }
}

ipcMain.handle('sync-tags', async () => {
  try {
    const tags = await readTagsFile();
    const settings = await readSettingsFile();
    let updatedCount = 0;

    for (const [oldPath, fileTags] of Object.entries(tags)) {
      if (oldPath !== 'tagColors') {
        const filename = path.basename(oldPath);
        const newPath = await findNewPath(
          oldPath,
          filename,
          settings.lastDirectory
        );

        if (newPath && newPath !== oldPath) {
          delete tags[oldPath];
          tags[newPath] = fileTags;
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      await writeTagsFile(tags);
    }

    return { updatedCount, totalFiles: Object.keys(tags).length - 1 }; // Subtract 1 for 'tagColors'
  } catch (error) {
    console.error('Error syncing tags:', error);
    return { error: error.message };
  }
});

async function findNewPath(oldPath, filename, lastDirectory) {
  if (lastDirectory) {
    const newPath = path.join(lastDirectory, filename);
    try {
      await fs.access(newPath);
      return newPath;
    } catch (error) {
      // File not found in the new location, return null
      return null;
    }
  }
  return null;
}

async function writeTagsFile(tags) {
  await fs.writeFile(tagsFilePath, JSON.stringify(tags, null, 2));
}

// Helper function to find full path from filename
async function findFullPath(filename) {
  const settings = await readSettingsFile();
  if (settings.lastDirectory) {
    const files = await fs.readdir(settings.lastDirectory, {
      withFileTypes: true,
    });
    for (const file of files) {
      if (file.isFile() && file.name === filename) {
        return path.join(settings.lastDirectory, filename);
      }
    }
  }
  return null;
}

async function readSettingsFile() {
  try {
    const data = await fs.readFile(settingsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { useFullPath: true }; // TODO: ?
  }
}

async function writeSettingsFile(settings) {
  await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
}

ipcMain.handle('read-directory', async (event, dirPath) => {
  console.log('Reading directory');
  try {
    const files = await fs.readdir(dirPath);
    console.log('Returning files: ', files);
    return files;
  } catch (error) {
    console.error('Failed to read directory:', error);
    return [];
  }
});

ipcMain.handle('read-file-tags', async (event, filePath) => {
  const tags = await readTagsFile();
  return tags[filePath] || [];
});

ipcMain.handle('write-file-tags', async (event, filePath, tags) => {
  try {
    const allTags = await readTagsFile();
    allTags[filePath] = tags;
    await writeTagsFile(allTags);
    return true;
  } catch (error) {
    console.error('Failed to write tags:', error);
    return false;
  }
});

ipcMain.handle('get-tags-file-path', () => {
  return tagsFilePath;
});

ipcMain.handle('get-all-tags', async () => {
  const tagsData = await readTagsFile();
  const allTags = new Set();

  // Loop through all entries except 'tagColors'
  for (const [key, value] of Object.entries(tagsData)) {
    if (key !== 'tagColors' && Array.isArray(value)) {
      value.forEach((tag) => allTags.add(tag));
    }
  }

  return Array.from(allTags);
});

ipcMain.handle('get-files-with-tag', async (event, tag) => {
  const tagsData = await readTagsFile();
  const filesWithTag = [];

  for (const [filePath, tags] of Object.entries(tagsData)) {
    if (filePath !== 'tagColors' && Array.isArray(tags) && tags.includes(tag)) {
      filesWithTag.push(filePath);
    }
  }

  return filesWithTag;
});

ipcMain.handle('save-last-directory', async (event, dirPath) => {
  const settings = await readSettingsFile();
  settings.lastDirectory = dirPath;
  await writeSettingsFile(settings);
});

ipcMain.handle('get-last-directory', async () => {
  const settings = await readSettingsFile();
  return settings.lastDirectory || '';
});

ipcMain.handle('get-tag-colors', async () => {
  const tags = await readTagsFile();
  return tags.tagColors || {};
});

ipcMain.handle('save-tag-colors', async (event, tagColors) => {
  const tags = await readTagsFile();
  tags.tagColors = tagColors;
  await writeTagsFile(tags);
});

const thumbnailCache = new Map();
ipcMain.handle('generate-thumbnails', async (event, filePaths) => {
  const thumbnails = await Promise.all(
    filePaths.map(async (filePath) => {
      if (thumbnailCache.has(filePath)) {
        return thumbnailCache.get(filePath);
      }

      const ext = path.extname(filePath).toLowerCase();
      const thumbnailPath = path.join(
        app.getPath('temp'),
        `${path.basename(filePath)}.thumb.jpg`
      );

      if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext)) {
        return { filePath, thumbnailPath: filePath };
      } else if (['.mp4', '.avi', '.mov', '.mkv'].includes(ext)) {
        try {
          await new Promise((resolve, reject) => {
            ffmpeg(filePath)
              .screenshots({
                count: 1,
                filename: path.basename(thumbnailPath),
                folder: path.dirname(thumbnailPath),
                size: '150x?',
              })
              .on('end', resolve)
              .on('error', reject);
          });

          // Only caching videos
          const result = { filePath, thumbnailPath };
          thumbnailCache.set(filePath, result);
          return result;
        } catch (error) {
          console.error(`Error generating thumbnail for ${filePath}:`, error);
          return { filePath, thumbnailPath: null };
        }
      } else {
        return { filePath, thumbnailPath: null };
      }
    })
  );

  return thumbnails;
});
