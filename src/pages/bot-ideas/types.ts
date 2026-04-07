export type TBotStatus = 'Active' | 'Testing' | 'Beta' | 'Inactive';
export type TRiskLevel = 'Low' | 'Medium' | 'High';
export type TBotIdeasView = 'library' | 'submit' | 'my-bots' | 'loader';

export type TBot = {
    id: string;
    name: string;
    strategy: string;
    market: string;
    risk: TRiskLevel;
    winRate: number;
    status: TBotStatus;
    description: string;
    author: string;
    rating: number;
    trades: number;
    profit: number;
    tags: string[];
};

export type TBotIdea = {
    name: string;
    strategy: string;
    market: string;
    risk: TRiskLevel;
    logic: string;
};

export type TTradeLog = {
    id: string;
    time: string;
    contract: string;
    stake: number;
    result: 'Win' | 'Loss';
    profit: number;
};
