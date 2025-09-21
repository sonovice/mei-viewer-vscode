export type Nullable<T> = T | null | undefined;

export type VerovioModuleType = { [key: string]: unknown };
export type CreateVerovioModule = (opts: {
	locateFile: (path: string) => string;
}) => Promise<VerovioModuleType>;

export type VerovioToolkitType = {
	setOptions: (opts: Record<string, unknown>) => void;
	loadData: (mei: string) => void;
	renderToSVG: (page: number) => string;
	getPageCount: () => number;
	getPageWithElement?: (xmlId: string) => number;
};

export type VerovioEsm = {
	VerovioToolkit: new (m: VerovioModuleType) => VerovioToolkitType;
};
