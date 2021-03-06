'use strict'

import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'
import Store from 'electron-store'
import jetpack from 'fs-jetpack'
import fs from 'fs'
import path from 'path'
import { enforceMacOSAppLocation } from 'electron-util'
import { autoUpdateApp, checkForUpdates } from './updater.js'

import 'electron-context-menu'

const log = require('electron-log')

// let myWindow = null
const store = new Store()

/**
 * Set `__static` path to static files in production
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-static-assets.html
 */
if (process.env.NODE_ENV !== 'development') {
  global.__static = require('path').join(__dirname, '/static').replace(/\\/g, '\\\\')
}

let mainWindow
let logsWindow
const winURL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:9080'
  : `file://${__dirname}/index.html`

const openAboutWindow = require('about-window').default

function createWindow () {
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    height: 650,
    useContentSize: true,
    width: 960,
    minWidth: 900,
    minHeight: 600,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      webSecurity: false
    }
  })

  mainWindow.loadURL(winURL)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Create the Application's main menu
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteandmatchstyle' },
        { role: 'delete' },
        { role: 'selectall' }
      ]
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ]

  const version = app.getVersion()

  if (process.platform === 'win32') {
    template.unshift({
      label: 'Ride Receipts',
      submenu: [
        {
          label: 'About',
          click: () =>
            openAboutWindow({
              icon_path: path.join(__static, '/256x256.png'),
              copyright: 'Copyright (c) 2018 Hello Efficiency Inc.',
              open_devtools: process.env.NODE_ENV !== 'production',
              homepage: 'https:/ridereceipts.io',
              product_name: 'Ride Receipts',
              package_json_dir: path.join(__dirname, '../..'),
              use_version_info: false
            })
        },
        {
          label: 'Check for update',
          click: function (menuItem, browserWindow, event) {
            checkForUpdates(menuItem, browserWindow, event)
          }
        },
        {
          label: 'View license',
          click: () => shell.openExternal('https://ridereceipts.io/license-agreement/')
        },
        {
          label: `Version ${version}`,
          enabled: false
        },
        {
          label: 'View logs',
          click: function () {
            if (typeof logsWindow === 'undefined' || logsWindow === null || logsWindow.isDestroyed()) {
              const modalPath = process.env.NODE_ENV === 'development' ? 'http://localhost:9080/#/view-logs' : `file://${__dirname}/index.html#view-logs`
              logsWindow = new BrowserWindow({
                width: 860,
                height: 600,
                useContentSize: false,
                resizable: false,
                webPreferences: {
                  nodeIntegration: true,
                  nodeIntegrationInWorker: true,
                  webSecurity: false
                }
              })
              logsWindow.setTitle('Logs')
              logsWindow.loadURL(modalPath)
            } else {
              logsWindow.show()
            }
          }
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  if (process.platform === 'darwin') {
    template.unshift({
      label: 'Ride Receipts',
      submenu: [
        { role: 'about' },
        {
          label: 'View license',
          click: () => shell.openExternal('https://ridereceipts.io/license-agreement/')
        },
        {
          label: 'Check for update',
          click: function (menuItem, browserWindow, event) {
            checkForUpdates(menuItem, browserWindow, event)
          }
        },
        {
          label: `Version ${version}`,
          enabled: false
        },
        {
          label: 'View logs',
          click: function () {
            if (typeof logsWindow === 'undefined' || logsWindow === null || logsWindow.isDestroyed()) {
              const modalPath = process.env.NODE_ENV === 'development' ? 'http://localhost:9080/#/view-logs' : `file://${__dirname}/index.html#view-logs`
              logsWindow = new BrowserWindow({
                width: 860,
                height: 600,
                useContentSize: false,
                resizable: false,
                webPreferences: {
                  nodeIntegration: true,
                  nodeIntegrationInWorker: true,
                  webSecurity: false
                }
              })
              logsWindow.setTitle('Logs')
              logsWindow.loadURL(modalPath)
            } else {
              logsWindow.show()
            }
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
// Allow only one instance
app.requestSingleInstanceLock()
app.on('second-instance', function (event, argv, cwd) {
  app.quit()
})

app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.on('ready', () => {
  createWindow()
  // Move to Application folder on MacOS
  enforceMacOSAppLocation()
  if (process.env.NODE_ENV === 'production') {
    autoUpdateApp()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('quit', () => {
  session.defaultSession.clearStorageData()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

ipcMain.on('online-status-changed', (event, status) => {
  event.sender.send('onlinestatus', status)
})

// Download PDF
ipcMain.on('downloadPDF', (event, data) => {
  const documentDir = jetpack.cwd(store.get('invoicePath'))
  const rideDirectory = data.rideType
  const cancelled = data.cancelled ? data.cancelled : false
  var invoiceDate = data.invoiceDate
  var folderPath
  if (cancelled) {
    folderPath = `${documentDir.path()}/${data.email}/${rideDirectory}/Cancelled/${data.year}/`
  } else {
    folderPath = `${documentDir.path()}/${data.email}/${rideDirectory}/${data.year}/`
  }

  if (!jetpack.exists(documentDir.path(folderPath))) {
    jetpack.dir(documentDir.path(folderPath))
  }

  const pdfBrowser = new BrowserWindow({
    show: false,
    webPreferences: {
      devTools: false,
      nodeIntegration: true
    }
  })
  pdfBrowser.loadURL(data.html)
  pdfBrowser.webContents.on('did-finish-load', async () => {
    const htmldata = await pdfBrowser.webContents.printToPDF({
      marginsType: 1,
      pageSize: 'A4',
      printBackground: true
    })
    fs.writeFile(`${folderPath}/${rideDirectory}-${invoiceDate}.pdf`, htmldata, (error) => {
      if (error) {
        log.error(error)
      }
      log.info('Write PDF successfully.')
      pdfBrowser.close()
    })
  })
})
