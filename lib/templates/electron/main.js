/* eslint-disable no-sync */
/* global process, require */
const
    {app, shell, BrowserWindow, Menu} = require('electron'),
    fs = require('fs');

/* adaptfully-steam-init */
/* /adaptfully-steam-init */

/**
 * Creates window.
 */
function createWindow () {
    // Create the browser window.
    const
        debugMode = false,
        lastState = (function () {
            let state = null;

            try {
                state = JSON.parse(fs.readFileSync(app.getPath('userData') + '/window-state.json', 'utf8'));
            } catch (e) {}

            return state || {
                bounds: {
                    width: 800,
                    height: 600
                },
                maximized: false,
                fullscreen: false
            };
        })(),
        win = new BrowserWindow({
            backgroundColor: '#E4378E',
            width: lastState.bounds.width,
            height: lastState.bounds.height,
            minWidth: 200,
            minHeight: 100,
            webPreferences: {
                devTools: debugMode,
                nodeIntegration: false,
                contextIsolation: true
                /* adaptfully-steam-preload */
                /* /adaptfully-steam-preload */
            },
            show: false
        });

    if (lastState.maximized) {
        win.maximize();
    }
    if (lastState.fullscreen) {
        win.setFullScreen(true);
    }

    if (!debugMode) {
        Menu.setApplicationMenu(null);
    }

    win.once('ready-to-show', () => { // helps prevent flicker-loading
        win.show();
    });

    // and load the index.html of the app.
    win.loadFile('index.html');

    win.webContents.on('will-navigate', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });


    //win.webContents.openDevTools();

    win.on('close', () => {
        fs.writeFileSync(app.getPath('userData') + '/window-state.json', JSON.stringify({
            bounds: win.getNormalBounds(),
            maximized: win.isMaximized(),
            fullscreen: win.isFullScreen()
        }));
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
