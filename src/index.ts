"use strict";

import {
  JupyterLab,
  JupyterLabPlugin,
  ApplicationShell
} from "@jupyterlab/application";

import {
  ICommandPalette,
  CommandToolbarButton,
  IClientSession
} from "@jupyterlab/apputils";

import { DocumentRegistry } from "@jupyterlab/docregistry";

import {
  INotebookModel,
  NotebookPanel,
  INotebookTracker
} from "@jupyterlab/notebook";

import { Kernel, Session, KernelMessage } from "@jupyterlab/services";
import { find } from "@phosphor/algorithm";
import { CommandRegistry } from "@phosphor/commands";
import { Token } from "@phosphor/coreutils";
import { Cell } from "@jupyterlab/cells";
import * as ReactDOM from "react-dom";

import { KernelSpyView } from "./widget";
import "../style/index.css";

/** IDs of the commands added by this extension. **/
interface CommandString {
  [key: string]: string;
}

interface IOptions {
  msgType: string;
  channel: Channel;
  session: string;
  username?: string;
  msgId?: string;
}

type Channel = 'shell' | 'iopub' | 'stdin';

const CommandIDs = <CommandString>{
  kernelmessage: "kernelink:new",
  executetime: "executetime:new"
};

export type IKernelMessageInspector = DocumentRegistry.IWidgetExtension<
  NotebookPanel,
  INotebookModel
>;

/**
 * The token identifying the JupyterLab plugin.
 */
export const IKernelMessageInspector = new Token<IKernelMessageInspector>(
  "jupyter.extensions.kernelink"
);

export class KernelMessageInspector {
  //define types
  public tracker: INotebookTracker;
  public commands: CommandRegistry;
  protected shell: ApplicationShell;
  public kernelSpyViewArray: {
    [id: string]: KernelSpyView;
  } = {};

  constructor(
    commands: CommandRegistry,
    tracker: INotebookTracker,
    shell: ApplicationShell
  ) {
    this.commands = commands;
    this.tracker = tracker;
    this.shell = shell;
    this.tracker.widgetAdded.connect(this._onAddWidget, this);
    this.tracker.currentChanged.connect(this._onCurrentChanged, this);
    this.commands.commandExecuted.connect(this._onCommandExecuted, this)
  }

  /**
   *  A Promise that is fulfilled when the session associated w/ the connector is ready.
   */
  private _readyKernel(session: IClientSession): Promise<void> {
    return session.ready.then(() => {
      return session.kernel!.ready;
    });
  }

  private _onAddWKernel(
    session: IClientSession,
    args: Session.IKernelChangedArgs
  ): void {
    session.statusChanged.connect((sender, new_status: Kernel.Status) => {
      switch (new_status) {
        case "restarting":
          break;
        case "idle":
          break;
        case "busy":
          break;
        case "connected":
          this._readyKernel(session).then(() => {
            if (!this.kernelSpyViewArray[session.kernel!.id]) {
              this.kernelSpyViewArray[session.kernel!.id] = new KernelSpyView(
                session.kernel! as Kernel.IKernel,
                this.onCompliteExecute
              );
            }
            this._executeCustomMes();
            let kernel = <Kernel.IKernel> session.kernel;
            kernel.anyMessage.connect(this._onMessage, this);

          });
          break;
        default:
          break;
      }
    });
  }

  protected onCompliteExecute = (): void => {
    const kernelId = this.tracker.currentWidget!.context.session.kernel!.id;
    const { executedTime, arrayMessageCellById } = this.messagelog(kernelId)!;
    for (let key in executedTime) {
      if (document.getElementById(`${key}-execute-time`)) {
        document.getElementById(`${key}-execute-time`)!.innerText =
          executedTime[key];
      }
    }

    for (let key in arrayMessageCellById) {
      const messageComponent = arrayMessageCellById[key];
      if (document.getElementById(`${key}-kernel-message`)) {
        ReactDOM.render(messageComponent, document.getElementById(
          `${key}-kernel-message`
        ) as HTMLElement);
      }
    }
  };


  private _onMessage(sender: Kernel.IKernel, args: Kernel.IAnyMessageArgs) {
    const { msg } = args;
    console.log('msgKern',msg);
  }


  private _onCurrentChanged(tracker: INotebookTracker, widget: NotebookPanel): void {
    console.log('_onCurrenttracker',tracker);
    console.log('_onCurrentwidget',widget);
  }

  private _onAddWidget(tracker: INotebookTracker, widget: NotebookPanel): void {
    widget.context.session.kernelChanged.connect(this._onAddWKernel, this);
    widget.context.session.ready.then(() => {
      this._createButtons(widget);
      this._setupCells(widget);
    });
  }

  private _onCommandExecuted(command: CommandRegistry, args: CommandRegistry.ICommandExecutedArgs): void {
    console.log('command',command);
    console.log('args',args);
  }

  private _executeCustomMes(): void {
    const kernel = this.tracker.currentWidget!.context.session.kernel;
    let options: IOptions = {
      msgType: 'comm_msg',
      channel: 'shell',
      username: kernel!.username,
      session: kernel!.clientId
    };
    let content = {
      comm_id: '1',
      data: '2'
    };

    let metadata = {
      nameNotebook: 'notebook001',
      nameUser: 'User001'
    };

    let msg = KernelMessage.createShellMessage(options, content, metadata);
    kernel!.sendShellMessage(msg, false, true);
  }

  private _createButtons(nb: NotebookPanel) {
    // Add buttons to toolbar
    let buttons: CommandToolbarButton[] = [];
    let insertionPoint = -1;
    find(nb.toolbar.children(), (tbb, index) => {
      if (tbb.hasClass("jp-Notebook-toolbarCellType")) {
        insertionPoint = index;
        return true;
      }
      return false;
    });

    let i = 1;
    for (let key in CommandIDs) {
      let button = new CommandToolbarButton({
        id: CommandIDs[key],
        commands: this.commands
      });
      if (insertionPoint >= 0) {
        nb.toolbar.insertItem(
          insertionPoint + i++,
          this.commands.label(CommandIDs[key]),
          button
        );
      } else {
        nb.toolbar.addItem(this.commands.label(CommandIDs[key]), button);
      }
      buttons.push(button);
    }
  }

  //add cells info
  private _setupCells(widget: NotebookPanel) {
    const { content } = widget;
    content.widgets.forEach(cell => this._addCellInfo(cell));
  }

  private _addCellInfo = (cell: Cell) => {
    const { model } = cell;
    // const { metadata } = model;

    let cellExecuteTime = document.createElement("div");
    cellExecuteTime.id = `${model.id}-execute-time`;
    cellExecuteTime.className = `jp-execute-time jp-display-none`;
    cellExecuteTime.innerHTML = `Executed time`;
    cell.editorWidget.node.appendChild(cellExecuteTime);

    let cellKernelMessage = document.createElement("div");
    cellKernelMessage.id = `${model.id}-kernel-message`;
    cellKernelMessage.className = `jp-kernel-message jp-display-none`;
    cellKernelMessage.innerHTML = `kernel message`;
    cell.editorWidget.node.appendChild(cellKernelMessage);

    // let currentValue = metadata.get("Existed_time");
    // update cell metadata and class with new value if toggle button 'executetime' was clicked
    // if (!currentValue) {
    //     // metadata.set("Existed_time", { startTime: "123", endTime: "456" });
    // } else {
    //     // metadata.set("Existed_time", { startTime: "123", endTime: "456" });
    // }
  };

  public messagelog = (kernelId: string) => {
    if (this.kernelSpyViewArray[kernelId]) {
      return this.kernelSpyViewArray[kernelId].messagelog;
    }
  };
}

/**
 * Add the main file view commands to the application's command registry.
 */
function addCommands(kernelMessageInspector: KernelMessageInspector): void {
  /**
   * Whether there is an active notebook.
   */
  function hasKernel(): boolean {
    return (
      kernelMessageInspector.tracker.currentWidget !== null &&
      kernelMessageInspector.tracker.currentWidget.context.session.kernel !==
        null
    );
  }

  kernelMessageInspector.commands.addCommand(CommandIDs.kernelmessage, {
    label: "kernel messages",
    caption: "show cells execute data messages",
    iconClass: "jp-Icon jp-Icon-16 jp-kernelspyIcon",
    isEnabled: hasKernel,
    execute: () => {
      for (let cell of document.getElementsByClassName("jp-kernel-message")) {
        cell.classList.toggle("jp-display-block");
        cell.classList.toggle("jp-display-none");
      }
    }
  });

  kernelMessageInspector.commands.addCommand(CommandIDs.executetime, {
    label: "cells execute time",
    caption: "show cells execute time",
    iconClass: "jp-Icon jp-Icon-16 jp-exTimeIcon",
    isEnabled: hasKernel,
    execute: () => {
      for (let cell of document.getElementsByClassName("jp-execute-time")) {
        cell.classList.toggle("jp-display-block");
        cell.classList.toggle("jp-display-none");
      }
    }
  });

  function refreshNewCommand() {
    kernelMessageInspector.commands.notifyCommandChanged(
      CommandIDs.kernelmessage
    );
    kernelMessageInspector.commands.notifyCommandChanged(
      CommandIDs.executetime
    );
  }

  // Update the command registry when the notebook state changes.
  kernelMessageInspector.tracker.currentChanged.connect(refreshNewCommand);

  let prevWidget: NotebookPanel | null =
    kernelMessageInspector.tracker.currentWidget;
  if (prevWidget) {
    prevWidget.context.session.kernelChanged.connect(refreshNewCommand);
  }
  kernelMessageInspector.tracker.currentChanged.connect(tracker => {
    if (prevWidget) {
      prevWidget.context.session.kernelChanged.disconnect(refreshNewCommand);
    }
    prevWidget = tracker.currentWidget;
    if (prevWidget) {
      prevWidget.context.session.kernelChanged.connect(refreshNewCommand);
    }
  });
}

/**
 * Activate extension
 */
function activate(app: JupyterLab, tracker: INotebookTracker) {
  let { commands, shell } = app;
  const kernelMessageInspector = new KernelMessageInspector(
    commands,
    tracker,
    shell
  );

  // TODO: Recreate views from layout restorer
  addCommands(kernelMessageInspector);
}

/**
 * Initialization data for the jupyterlab-kernelink extension.
 */
const extension: JupyterLabPlugin<void> = {
  id: "jupyterlab-kernelink",
  autoStart: true,
  requires: [INotebookTracker, ICommandPalette],
  provides: IKernelMessageInspector,
  activate
};

export default extension;
