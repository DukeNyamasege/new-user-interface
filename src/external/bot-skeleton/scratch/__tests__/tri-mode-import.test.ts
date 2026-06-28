jest.mock('@deriv-com/translations', () => {
    const interpolate = (text: string, values: Record<string, string> = {}) =>
        text.replace(/{{(.*?)}}/g, (match, key: string) => values[key.trim()] ?? match);

    return {
        getAllowedLanguages: jest.fn(() => ({ EN: 'English' })),
        getInitialLanguage: jest.fn(() => 'EN'),
        initializeI18n: jest.fn(),
        localize: jest.fn(interpolate),
        Localize: ({
            i18n_default_text,
            values = {},
        }: {
            i18n_default_text: string;
            values?: Record<string, string>;
        }) => interpolate(i18n_default_text, values),
        TranslationProvider: ({ children }: { children: unknown }) => children,
        useTranslations: () => ({
            currentLang: 'EN',
            localize: interpolate,
        }),
    };
});

import fs from 'fs';
import path from 'path';
import { loadBlockly } from '@/external/bot-skeleton/scratch/blockly';
import { isAllRequiredBlocksEnabled } from '@/external/bot-skeleton/scratch/utils';

const BOT_FILE_PATH = path.join(
    process.cwd(),
    'public',
    'riskmanagers.site',
    'Tri-Mode Regime Switcher (Template Fixed).xml'
);

describe('Tri-Mode Blockly workspace import', () => {
    beforeAll(async () => {
        await loadBlockly(false);
    });

    it('loads every block and satisfies mandatory purchase validation', () => {
        window.Blockly.Block.prototype.initSvg ??= jest.fn();
        window.Blockly.Block.prototype.queueRender ??= jest.fn();
        window.Blockly.Block.prototype.renderEfficiently ??= jest.fn();
        const workspace = new window.Blockly.Workspace();
        window.Blockly.derivWorkspace = workspace;
        const xml = window.Blockly.utils.xml.textToDom(fs.readFileSync(BOT_FILE_PATH, 'utf8'));

        expect(() => window.Blockly.Xml.domToWorkspace(xml, workspace)).not.toThrow();

        const blocks = workspace.getAllBlocks(false);
        const loaded_block_ids = new Set(blocks.map(block => block.id));
        const source_block_ids = Array.from(xml.querySelectorAll('block')).map(block => block.getAttribute('id'));
        expect(source_block_ids.every(block_id => block_id && loaded_block_ids.has(block_id))).toBe(true);
        expect(blocks.filter(block => block.type === 'smart_purchase_contract')).toHaveLength(1);
        expect(blocks.filter(block => block.type === 'purchase')).toHaveLength(0);
        expect(blocks.filter(block => block.type === 'trade_again')).toHaveLength(1);
        expect(blocks.some(block => block.disabled)).toBe(false);
        expect(isAllRequiredBlocksEnabled(workspace)).toBe(true);

        workspace.dispose();
    });
});
