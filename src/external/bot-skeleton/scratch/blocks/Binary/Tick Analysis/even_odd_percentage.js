import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.even_odd_percentage = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('{{ parity }} %% of last {{ count }} digits', {
                parity: '%1',
                count: '%2',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PARITY',
                    options: [
                        [localize('Even'), 'even'],
                        [localize('Odd'), 'odd'],
                    ],
                },
                {
                    type: 'input_value',
                    name: 'COUNT',
                    check: 'Number',
                },
            ],
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns the percentage of even or odd digits from the last N ticks'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Even/Odd %'),
            description: localize('Returns the percentage of even or odd digits from the last N ticks.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.even_odd_percentage = block => {
    const count =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'COUNT',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_NONE
        ) || 1000;
    const parity = block.getFieldValue('PARITY');
    const comparator = parity === 'odd' ? '!== 0' : '=== 0';

    return [
        `(() => {
            const digits = Bot.getLastDigitList().slice(-Math.max(1, Number(${count}) || 1));
            return digits.length ? (digits.filter(value => Number(value) % 2 ${comparator}).length / digits.length) * 100 : 0;
        })()`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_FUNCTION_CALL,
    ];
};
