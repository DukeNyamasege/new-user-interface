type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    BOT_IDEAS: 0,
    BEST_BOTS: 1,
    DASHBOARD: 2,
    BOT_BUILDER: 3,
    DTRADER: 4,
    COMBO: 5,
    SCANNER: 6,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-bot-ideas',
    'id-best-bots',
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-dtrader',
    'id-combo',
    'id-scanner',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
