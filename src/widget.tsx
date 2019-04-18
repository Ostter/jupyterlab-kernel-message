"use strict";

import * as React from "react";
import { VDomRenderer } from "@jupyterlab/apputils";
import { KernelMessage, Kernel } from "@jupyterlab/services";
import { each } from "@phosphor/algorithm";
import { JSONValue } from "@phosphor/coreutils";
import { Widget } from "@phosphor/widgets";
import { ObjectInspector, ObjectLabel } from "react-inspector";
import { KernelSpyModel, ThreadIterator } from "./model";

import "../style/index.css";
import { getTimeMessage, compareTo } from "./executeTime";

const theme = {
  BASE_FONT_FAMILY: "var(--jp-code-font-family)",
  BASE_FONT_SIZE: "var(--jp-code-font-size)",
  BASE_LINE_HEIGHT: "var(--jp-code-line-height)",

  BASE_BACKGROUND_COLOR: "var(--jp-layout-color0)",
  BASE_COLOR: "var(--jp-content-font-color1)",

  OBJECT_NAME_COLOR: "var(--jp-mirror-editor-attribute-color)",
  OBJECT_VALUE_NULL_COLOR: "var(--jp-mirror-editor-builtin-color)",
  OBJECT_VALUE_UNDEFINED_COLOR: "var(--jp-mirror-editor-builtin-color)",
  OBJECT_VALUE_REGEXP_COLOR: "var(--jp-mirror-editor-string-color)",
  OBJECT_VALUE_STRING_COLOR: "var(--jp-mirror-editor-string-color)",
  OBJECT_VALUE_SYMBOL_COLOR: "var(--jp-mirror-editor-operator-color)",
  OBJECT_VALUE_NUMBER_COLOR: "var(--jp-mirror-editor-number-color)",
  OBJECT_VALUE_BOOLEAN_COLOR: "var(--jp-mirror-editor-builtin-color))",
  OBJECT_VALUE_FUNCTION_KEYWORD_COLOR: "var(--jp-mirror-editor-def-color))",

  ARROW_COLOR: "var(--jp-content-font-color2)",
  ARROW_MARGIN_RIGHT: 3,
  ARROW_FONT_SIZE: 12,

  TREENODE_FONT_FAMILY: "var(--jp-code-font-family)",
  TREENODE_FONT_SIZE: "var(--jp-code-font-size)",
  TREENODE_LINE_HEIGHT: "var(--jp-code-line-height)",
  TREENODE_PADDING_LEFT: 12
};

interface IRendererArgs {
  depth: number;
  name: string;
  data: JSONValue;
  isNonenumerable: boolean;
  expanded: boolean;
}

function msgNodeRenderer(args: IRendererArgs) {
  const { name, depth, isNonenumerable, data } = args;
  if (depth !== 0) {
    return (
      <ObjectLabel
        key={`node-label`}
        name={name}
        data={data}
        isNonenumerable={isNonenumerable}
      />
    );
  }
  const msg = (data as any) as KernelMessage.IMessage;
  return <span key={`node-label`}>{msg.header.msg_id}</span>;
}

function Message(props: Message.IProperties): React.ReactElement<any>[] {
  const msg = props.message;
  const msgId = msg.header.msg_id;
  const threadStateClass = props.collapsed ? "jp-mod-collapsed" : "";
  const hasChildrenClass = props.hasChildren ? "jp-mod-children" : "";
  const tabIndex = props.hasChildren ? 0 : -1;
  return [
    <div
      key={`threadnode-${msgId}`}
      className="jp-kernelspy-threadnode"
      onClick={() => {
        props.onCollapse(props.message);
      }}
    >
      <div style={{ paddingLeft: 16 * props.depth }}>
        <button
          className={`jp-kernelspy-threadcollapser ${threadStateClass} ${hasChildrenClass}`}
          tabIndex={tabIndex}
        />
        <span className="jp-kernelspy-threadlabel">
          {msg.channel}.{msg.header.msg_type}
        </span>
      </div>
    </div>,
    <div key={`message-${msgId}`} className="jp-kernelspy-message">
      <ObjectInspector
        data={msg}
        theme={theme}
        nodeRenderer={msgNodeRenderer}
      />
    </div>
  ];
}

namespace Message {
  export interface IProperties {
    message: KernelMessage.IMessage;
    depth: number;
    collapsed: boolean;
    hasChildren: boolean;
    onCollapse: (message: KernelMessage.IMessage) => void;
  }
}

/**
 * The main view for the kernel spy.
 */
export class MessageLogView extends VDomRenderer<KernelSpyModel> {
  protected collapsed: { [key: string]: boolean } = {};
  private _arrayMessageCellById: {
    [key: string]: React.ReactElement<any>[];
  } = {};
  private _msgId: string = "";
  private _executedTime: {
    [key: string]: string;
  } = {};
  private _lastExecuteTime: string = '0';
  private _onExecute: Function;

  constructor(model: KernelSpyModel, onExecute: Function) {
    super();
    this.model = model;
    this._onExecute = onExecute;
    this.id = `kernelspy-messagelog-${this.model.kernel.id}`;
    this.addClass("jp-kernelspy-messagelog");
  }

  public get arrayMessageCellById(): {
    [key: string]: React.ReactElement<any>[];
  } {
    return this._arrayMessageCellById;
  }
  public get executedTime(): {
    [key: string]: string;
  } {
    return this._executedTime;
  }

  /**
   * Render the extension discovery view using the virtual DOM.
   */
  protected render(): React.ReactElement<any>[] {
    const elements: React.ReactElement<any>[] = [];

    let threads = new ThreadIterator(this.model!.tree, this.collapsed);
    let first = true;

    let cellId: string = "";

    each(threads, ({ args, hasChildren }) => {
      const depth = this.model!.depth(args);
      if (depth === 0) {
        if (first) {
          first = false;
        } else {
          // Insert spacer between main threads
          elements.push(
            <span
              key={`'divider-${args.msg.header.msg_id}`}
              className="jp-kernelspy-divider"
            />
          );
        }
      }
      const collapsed = this.collapsed[args.msg.header.msg_id];

      let messageElements = Message({
        message: args.msg,
        depth,
        collapsed,
        hasChildren,
        onCollapse: message => {
          this.onCollapse(message);
        }
      });

      if (args.msg.metadata && args.msg.metadata.cellId) {
        cellId = args.msg.metadata.cellId as string;
        this._msgId = args.msg.header.msg_id;

        //add new cellId message array if it's not existed yet or rewrite old messages of this cell Id
        this._arrayMessageCellById = {
          ...this._arrayMessageCellById,
          ...{ [cellId]: [] }
        };
        this._arrayMessageCellById[cellId].push(
          <span
            key={`'divider-${this._msgId}`}
            className="jp-kernelspy-divider"
          />,
          ...messageElements
        );
      }

      //request message
      if (
        args.msg.header.msg_type === "execute_request" &&
        args.msg.channel === "shell"
      ) {
        args.msg.metadata.nameNotebook = 'notebook001';
        args.msg.metadata.nameUser = 'User001'
      }

      //add child message
      // let msg_id = args.msg.parent_header['msg_id'];
      let parent_header = args.msg.parent_header as KernelMessage.IHeader;
      if (
        "msg_id" in parent_header &&
        parent_header.msg_id &&
        parent_header.msg_id === this._msgId
      ) {
        this._arrayMessageCellById[cellId].push(...messageElements);
        if (
          //   (args.msg.header.msg_type = "execute_reply") &&
          //   args.msg.metadata.started
          // ) {
          args.msg.header.msg_type === "execute_reply" &&
          args.msg.channel === "shell"
        ) {
          this._executedTime = {
            ...this._executedTime,
            ...{
              [cellId]: getTimeMessage(
                args.msg.metadata.started,
                args.msg.header.date
              )
            }
          };
          if (
            args.msg.header.date &&
            compareTo(args.msg.header.date, this._lastExecuteTime)
          ) {
            this._lastExecuteTime = args.msg.header.date as string;
            this._onExecute();
          }
        }
      }

      elements.push(...messageElements);
    });
    return elements;
  }

  onCollapse(msg: KernelMessage.IMessage) {
    const id = msg.header.msg_id;
    this.collapsed[id] = !this.collapsed[id];
    this.update();
  }
}

/**
 * The main view for the kernel spy.
 */
export class KernelSpyView extends Widget {
  private _messagelog: MessageLogView;
  private _model: KernelSpyModel;

  constructor(kernel: Kernel.IKernel, onExecute: Function) {
    super();
    this._model = new KernelSpyModel(kernel);
    this._messagelog = new MessageLogView(this._model, onExecute);
  }

  public get messagelog(): MessageLogView {
    return this._messagelog;
  }
}
