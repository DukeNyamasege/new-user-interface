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
        expect(generated_code).not.toContain('Bot.failExecutionCondition');
        expect(generated_code).not.toContain('DIGITDIFF');
        expect(generated_code).not.toContain('STAKE_FACTOR');
        expect(generated_code).toContain('Bot.getRecentTickAnalysisData(historySize)');
        expect(generated_code).toContain('Purchase request:');
        expect(generated_code).toContain('preserve_duration');
        expect(generated_code).toContain('Bot.getAskPrice(contractType)');
        expect(generated_code).toContain('Bot.getPayout(contractType)');
        expect(generated_code).toContain('Tri-Mode recovery updated after loss');
        expect(generated_code).toContain('recoveryAfterLosses');
        expect(generated_code).toContain('contractTypes      : [contractType]');
        expect(generated_code.indexOf('Bot.getRecentTickAnalysisData(historySize)')).toBeLessThan(
            generated_code.indexOf('Bot.purchase(contractType)')
        );

        workspace.dispose();
    });

    it('analyses fresh history before every signal and only returns a contract when the active trigger is confirmed', () => {
        const workspace = new window.Blockly.Workspace();
        const analysis = workspace.newBlock('tri_mode_regime_signal');
        const history = workspace.newBlock('math_number');
        const sequence_step = workspace.newBlock('math_number');
        history.setFieldValue('100', 'NUM');
        sequence_step.setFieldValue('0', 'NUM');
        analysis.getInput('HISTORY')?.connection?.connect(history.outputConnection);
        analysis.getInput('SEQUENCE_STEP')?.connection?.connect(sequence_step.outputConnection);

        const generator = window.Blockly.JavaScript.javascriptGenerator;
        generator.init(workspace);
        const notify = jest.fn();
        const bot = {
            getRecentTickAnalysisData: jest.fn(),
            notify,
        };
        const evaluate = (step: number, historyData: { digits: number[]; ticks: number[] }) => {
            sequence_step.setFieldValue(String(step), 'NUM');
            bot.getRecentTickAnalysisData.mockReturnValue(historyData);
            const [code] = generator.forBlock.tri_mode_regime_signal(analysis);
            return new Function('Bot', `return ${code};`)(bot);
        };

        expect(
            evaluate(0, {
                digits: [6, 8, 9, 5, 7, 8, 6, 3, 2, 1],
                ticks: [100, 100.1, 100.2, 100.3],
            })
        ).toBe(20);
        expect(
            evaluate(1, {
                digits: [0, 1, 2, 3, 4, 5, 1, 6, 7, 9],
                ticks: [100, 100.1, 100.2, 100.3],
            })
        ).toBe(21);
        expect(
            evaluate(2, {
                digits: [4, 6, 8, 0, 2, 4, 7, 1, 3, 5],
                ticks: [100, 100.1, 100.2, 100.3],
            })
        ).toBe(22);
        expect(
            evaluate(3, {
                digits: [1, 3, 5, 7, 9, 1, 0, 2, 4, 6],
                ticks: [100, 100.1, 100.2, 100.3],
            })
        ).toBe(23);
        expect(
            evaluate(4, {
                digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                ticks: [100.4, 100.3, 100.2, 100.1],
            })
        ).toBe(30);
        expect(
            evaluate(5, {
                digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                ticks: [100.1, 100.2, 100.3, 100.4],
            })
        ).toBe(31);
        expect(
            evaluate(0, {
                digits: [6, 8, 9, 5, 7, 8, 6, 4, 2, 1],
                ticks: [100, 100.1, 100.2, 100.3],
            })
        ).toBe(0);
        expect(bot.getRecentTickAnalysisData).toHaveBeenCalledWith(100);
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Trigger matched'),
            })
        );

        workspace.dispose();
    });

    it.each([
        [20, 'DIGITOVER', 4],
        [21, 'DIGITUNDER', 5],
        [22, 'DIGITEVEN', 0],
        [23, 'DIGITODD', 0],
        [30, 'CALL', 0],
        [31, 'PUT', 0],
    ])('maps signal %s to %s with prediction %s', (signal, expected_contract, expected_prediction) => {
        const workspace = new window.Blockly.Workspace();
        const signal_block = workspace.newBlock('math_number');
        signal_block.setFieldValue(String(signal), 'NUM');
        const value_block = workspace.newBlock('tri_mode_signal_value');
        value_block.getInput('SIGNAL')?.connection?.connect(signal_block.outputConnection);
        const generator = window.Blockly.JavaScript.javascriptGenerator;
        generator.init(workspace);

        value_block.setFieldValue('CONTRACT', 'VALUE_TYPE');
        const [contract_code] = generator.forBlock.tri_mode_signal_value(value_block);
        value_block.setFieldValue('PREDICTION', 'VALUE_TYPE');
        const [prediction_code] = generator.forBlock.tri_mode_signal_value(value_block);
        value_block.setFieldValue('DURATION', 'VALUE_TYPE');
        const [duration_code] = generator.forBlock.tri_mode_signal_value(value_block);

        expect(new Function(`return ${contract_code};`)()).toBe(expected_contract);
        expect(new Function(`return ${prediction_code};`)()).toBe(expected_prediction);
        expect(new Function(`return ${duration_code};`)()).toBe(signal >= 30 ? 3 : 1);

        workspace.dispose();
    });

    it('calculates an exact recovery stake after two consecutive losses and otherwise keeps the base stake', () => {
        const workspace = new window.Blockly.Workspace();
        const contract_type_block = workspace.newBlock('text');
        contract_type_block.setFieldValue('CALL', 'TEXT');
        const amount_block = workspace.newBlock('math_number');
        amount_block.setFieldValue('1', 'NUM');
        const duration_block = workspace.newBlock('math_number');
        duration_block.setFieldValue('3', 'NUM');
        const prediction_block = workspace.newBlock('math_number');
        prediction_block.setFieldValue('0', 'NUM');
        const recovery_after_block = workspace.newBlock('math_number');
        recovery_after_block.setFieldValue('2', 'NUM');
        const purchase_block = workspace.newBlock('smart_purchase_contract');
        purchase_block.getInput('CONTRACT_TYPE')?.connection?.connect(contract_type_block.outputConnection);
        purchase_block.getInput('AMOUNT')?.connection?.connect(amount_block.outputConnection);
        purchase_block.getInput('DURATION')?.connection?.connect(duration_block.outputConnection);
        purchase_block.getInput('PREDICTION')?.connection?.connect(prediction_block.outputConnection);
        purchase_block.getInput('RECOVERY_AFTER')?.connection?.connect(recovery_after_block.outputConnection);

        const generator = window.Blockly.JavaScript.javascriptGenerator;
        generator.init(workspace);
        const code = generator.forBlock.smart_purchase_contract(purchase_block);

        const start = jest.fn();
        const purchase = jest.fn();
        const notify = jest.fn();
        const getAskPrice = jest.fn(() => 1);
        const getPayout = jest.fn(() => 1.95);
        const sleep = jest.fn();

        (
            globalThis as typeof globalThis & {
                BinaryBotPrivateLimitations?: unknown;
                BinaryBotPrivateTriModeRecoveryState?: {
                    baseStake: number;
                    consecutiveLosses: number;
                    cumulativeLoss: number;
                    lastProcessedReference: string;
                    activeRecoveryStake: number;
                };
            }
        ).BinaryBotPrivateLimitations = {};
        (
            globalThis as typeof globalThis & {
                BinaryBotPrivateTriModeRecoveryState: {
                    baseStake: number;
                    consecutiveLosses: number;
                    cumulativeLoss: number;
                    lastProcessedReference: string;
                    activeRecoveryStake: number;
                };
            }
        ).BinaryBotPrivateTriModeRecoveryState = {
            baseStake: 1,
            consecutiveLosses: 2,
            cumulativeLoss: 2,
            lastProcessedReference: 'abc',
            activeRecoveryStake: 0,
        };

        new Function('Bot', 'sleep', code)(
            {
                start,
                purchase,
                notify,
                getAskPrice,
                getPayout,
            },
            sleep
        );

        expect(start).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                amount: 1,
                contractTypes: ['CALL'],
            })
        );
        expect(start).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                amount: 2.11,
                contractTypes: ['CALL'],
            })
        );
        expect(purchase).toHaveBeenCalledWith('CALL');
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Recovery mode active after 2 consecutive losses'),
            })
        );

        workspace.dispose();
    });
});
