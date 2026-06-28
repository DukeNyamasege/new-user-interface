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
import DBotStore from '@/external/bot-skeleton/scratch/dbot-store';
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
        window.Blockly.Block.prototype.initSvg ??= jest.fn();
        window.Blockly.Block.prototype.queueRender ??= jest.fn();
        window.Blockly.Block.prototype.renderEfficiently ??= jest.fn();
        DBotStore.singleton = {
            client: {
                currency: 'USD',
                is_logged_in: true,
                loginid: 'CRTEST',
            },
        };
    });

    it('loads every block and satisfies mandatory purchase validation', () => {
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

        const variable_db = new window.Blockly.Names('window');
        variable_db.variableMap = workspace.getVariableMap();
        window.Blockly.JavaScript.variableDB_ = variable_db;
        const generated_code = window.Blockly.JavaScript.javascriptGenerator.workspaceToCode(workspace);
        expect(generated_code).not.toContain('.includes(');
        expect(generated_code).toContain('Purchase request:');

        workspace.dispose();
    });

    it('selects the strongest recent digit other than the previous Differs prediction', () => {
        const workspace = new window.Blockly.Workspace();
        const predictor = workspace.newBlock('rotating_differ_prediction');
        const count = workspace.newBlock('math_number');
        const previous_digit = workspace.newBlock('math_number');
        count.setFieldValue('5', 'NUM');
        previous_digit.setFieldValue('4', 'NUM');
        predictor.getInput('COUNT')?.connection?.connect(count.outputConnection);
        predictor.getInput('PREVIOUS_DIGIT')?.connection?.connect(previous_digit.outputConnection);

        const generator = window.Blockly.JavaScript.javascriptGenerator;
        generator.init(workspace);
        const [code] = generator.forBlock.rotating_differ_prediction(predictor);
        const notify = jest.fn();
        const evaluate_prediction = new Function('Bot', `return ${code};`);
        const prediction = evaluate_prediction({
            getLastDigitList: () => [4, 4, 4, 7, 7],
            notify,
        });

        expect(prediction).toBe(7);
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('excluded previous digit 4'),
            })
        );

        workspace.dispose();
    });
});
