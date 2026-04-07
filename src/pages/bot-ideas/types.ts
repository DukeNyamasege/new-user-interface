export type TBotIdea = {
    id: string;
    bot_name: string;
    strategy_description: string;
    submitted_at: string;
};

export type TNotification = {
    type: 'success' | 'error';
    message: string;
};
