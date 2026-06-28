import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.rotating_differ_prediction = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Best Differs digit from last {{ count }} ticks excluding {{ previous_digit }}', {
                count: '%1',
                previous_digit: '%2',
            }),
            args0: [
                {
                    type: 'input_value',
                    name: 'COUNT',
                    check: 'Number',
                },
                {
                    type: 'input_value',
                    name: 'PREVIOUS_DIGIT',
                    check: 'Number',
                },
            ],
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Selects the most frequent recent digit while excluding the digit used by the previous Differs trade.'
            ),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Rotating Differs prediction'),
            description: localize(
                'Prevents consecutive Differs trades from using the same prediction while retaining frequency-based selection.'
            ),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rotating_differ_prediction = block => {
    const count =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'COUNT',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_NONE
        ) || 100;
    const previous_digit =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'PREVIOUS_DIGIT',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_NONE
        ) || -1;

    return [
        `(function () {
            var size = Math.max(1, Number(${count}) || 100);
            var digits = Bot.getLastDigitList().slice(-size);
            var previousValue = Number(${previous_digit});
            var excludedDigit = previousValue >= 0 && previousValue <= 9 ? Math.floor(previousValue) : -1;
            var candidate = 0;
            var candidateCount = 0;
            var index = 0;
            var highestCount = -1;
            var result = excludedDigit === 0 ? 1 : 0;
            for (candidate = 0; candidate < 10; candidate += 1) {
                if (candidate !== excludedDigit) {
                    candidateCount = 0;
                    for (index = 0; index < digits.length; index += 1) {
                        if (Number(digits[index]) === candidate) {
                            candidateCount += 1;
                        }
                    }
                    if (candidateCount > highestCount) {
                        highestCount = candidateCount;
                        result = candidate;
                    }
                }
            }
            Bot.notify({
                className: 'journal__text--analysis',
                message:
                    'Differs prediction: ' +
                    result +
                    ' (excluded previous digit ' +
                    (excludedDigit < 0 ? 'none' : excludedDigit) +
                    ', analysed ' +
                    digits.length +
                    ' recent digits).',
                sound: '',
                analysis_append: true,
                analysis_key: '${block.id}',
            });
            return result;
        })()`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_FUNCTION_CALL,
    ];
};
