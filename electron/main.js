const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    },
    icon: path.join(__dirname, 'icons', 'icon.png')
  });

  // Load the admin editor
  const editorPath = path.join(__dirname, '..', 'admin-editor', 'index.html');
  const editorUrl = pathToFileURL(editorPath).href;
  mainWindow.loadFile(editorPath);

  // The editor is a local-only utility. Prevent a changed dataset or future
  // markup from navigating the privileged desktop window to remote content.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== editorUrl) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  // Build application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open JSON...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFile()
        },
        {
          label: 'Save JSON...',
          accelerator: 'CmdOrCtrl+S',
          click: () => saveFile()
        },
        {
          label: 'Save JSON As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => saveFileAs()
        },
        { type: 'separator' },
        {
          label: 'Load Sample Data',
          click: () => loadSampleData()
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Praxium Map Editor',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: 'Praxium Map Editor',
              detail: 'Version 1.0.0\n\nA desktop application for editing the Praxium Interactive Network Map data.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

// Track the currently open file path
let currentFilePath = null;
// Paths the user chose in an Open/Save dialog. The renderer may only write to
// these, so a compromised page can't overwrite arbitrary files via save-file.
const approvedSavePaths = new Set();
function approvePath(filePath) {
  if (filePath) approvedSavePaths.add(path.resolve(filePath));
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      currentFilePath = filePath;
      approvePath(filePath);
      mainWindow.webContents.send('file-opened', { content, filePath });
      mainWindow.setTitle(`Praxium Map Editor - ${path.basename(filePath)}`);
    } catch (err) {
      dialog.showErrorBox('Error', `Failed to read file: ${err.message}`);
    }
  }
}

async function saveFile() {
  if (currentFilePath) {
    mainWindow.webContents.send('request-save', { filePath: currentFilePath });
  } else {
    saveFileAs();
  }
}

async function saveFileAs() {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: 'organization-network-map.json'
  });

  if (!result.canceled && result.filePath) {
    currentFilePath = result.filePath;
    approvePath(result.filePath);
    mainWindow.webContents.send('request-save', { filePath: result.filePath });
    mainWindow.setTitle(`Praxium Map Editor - ${path.basename(result.filePath)}`);
  }
}

function loadSampleData() {
  const samplePath = path.join(__dirname, '..', 'organization-network-map.json');
  try {
    const content = fs.readFileSync(samplePath, 'utf-8');
    mainWindow.webContents.send('file-opened', { content, filePath: samplePath });
    currentFilePath = null; // Don't overwrite sample on save
    mainWindow.setTitle('Praxium Map Editor - [Sample Data]');
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to load sample data: ${err.message}`);
  }
}

// IPC handlers
ipcMain.handle('save-file', async (event, { filePath, content }) => {
  if (typeof filePath !== 'string' || !filePath || typeof content !== 'string') {
    return { success: false, error: 'Invalid save request.' };
  }
  if (!approvedSavePaths.has(path.resolve(filePath))) {
    return { success: false, error: 'Choose where to save with the Save dialog first.' };
  }
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-categories', async () => {
  const categoriesPath = path.join(__dirname, '..', 'categories.json');
  try {
    const content = fs.readFileSync(categoriesPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Failed to read categories:', err);
    return [];
  }
});

ipcMain.handle('show-save-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: 'organization-network-map.json'
  });
  if (!result.canceled) approvePath(result.filePath);
  return result;
});

const MESSAGE_TYPES = new Set(['none', 'info', 'error', 'question', 'warning']);
ipcMain.handle('show-message', async (event, { type, title, message }) => {
  await dialog.showMessageBox(mainWindow, {
    type: MESSAGE_TYPES.has(type) ? type : 'info',
    title: String(title || ''),
    message: String(message || ''),
  });
});

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.praxium.mapeditor');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
