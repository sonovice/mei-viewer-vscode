export type InitMessage = {
	type: "init";
	content?: string;
	moduleBaseUri?: string;
	scalePercent?: number;
	debugLogging?: boolean;
};

export type UpdateMessage = {
	type: "update";
	content?: string;
};

export type HighlightMessage = {
	type: "highlightByXmlId";
	xmlId?: string;
};

export type PersistSettingsMessage = {
	type: "persistSettings";
	scalePercent?: number;
};

export type ElementClickedMessage = {
	type: "elementClicked";
	xmlId?: string;
};

export type ReadyMessage = { type: "ready" };

export type WebviewInboundMessage =
	| InitMessage
	| UpdateMessage
	| HighlightMessage;
export type WebviewOutboundMessage =
	| PersistSettingsMessage
	| ElementClickedMessage
	| ReadyMessage;
