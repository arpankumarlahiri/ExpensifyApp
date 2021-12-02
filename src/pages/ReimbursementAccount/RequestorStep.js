import React from 'react';
import lodashGet from 'lodash/get';
import {View} from 'react-native';
import {withOnyx} from 'react-native-onyx';
import _ from 'underscore';
import moment from 'moment';
import styles from '../../styles/styles';
import withLocalize, {withLocalizePropTypes} from '../../components/withLocalize';
import HeaderWithCloseButton from '../../components/HeaderWithCloseButton';
import CONST from '../../CONST';
import TextLink from '../../components/TextLink';
import Navigation from '../../libs/Navigation/Navigation';
import CheckboxWithLabel from '../../components/CheckboxWithLabel';
import Text from '../../components/Text';
import * as BankAccounts from '../../libs/actions/BankAccounts';
import IdentityForm from './IdentityForm';
import * as ValidationUtils from '../../libs/ValidationUtils';
import Onfido from '../../components/Onfido';
import compose from '../../libs/compose';
import ONYXKEYS from '../../ONYXKEYS';
import * as ReimbursementAccountUtils from '../../libs/ReimbursementAccountUtils';
import Log from '../../libs/Log';
import Growl from '../../libs/Growl';
import reimbursementAccountPropTypes from './reimbursementAccountPropTypes';
import ReimbursementAccountForm from './ReimbursementAccountForm';
import * as Link from '../../libs/actions/Link';

const propTypes = {
    /** Bank account currently in setup */
    reimbursementAccount: reimbursementAccountPropTypes.isRequired,

    ...withLocalizePropTypes,
};

class RequestorStep extends React.Component {
    constructor(props) {
        super(props);

        this.submit = this.submit.bind(this);
        this.clearErrorAndSetValue = this.clearErrorAndSetValue.bind(this);

        this.state = {
            firstName: ReimbursementAccountUtils.getDefaultStateForField(props, 'firstName'),
            lastName: ReimbursementAccountUtils.getDefaultStateForField(props, 'lastName'),
            requestorAddressStreet: ReimbursementAccountUtils.getDefaultStateForField(props, 'requestorAddressStreet'),
            requestorAddressCity: ReimbursementAccountUtils.getDefaultStateForField(props, 'requestorAddressCity'),
            requestorAddressState: ReimbursementAccountUtils.getDefaultStateForField(props, 'requestorAddressState'),
            requestorAddressZipCode: ReimbursementAccountUtils.getDefaultStateForField(props, 'requestorAddressZipCode'),
            dob: ReimbursementAccountUtils.getDefaultStateForField(props, 'dob'),
            ssnLast4: ReimbursementAccountUtils.getDefaultStateForField(props, 'ssnLast4'),
            isControllingOfficer: ReimbursementAccountUtils.getDefaultStateForField(props, 'isControllingOfficer', false),
            onfidoData: lodashGet(props, ['achData', 'onfidoData'], ''),
            isOnfidoSetupComplete: lodashGet(props, ['achData', 'isOnfidoSetupComplete'], false),
        };

        // Required fields not validated by `validateIdentity`
        this.requiredFields = [
            'isControllingOfficer',
        ];

        // Map a field to the key of the error's translation
        this.errorTranslationKeys = {
            firstName: 'bankAccount.error.firstName',
            lastName: 'bankAccount.error.lastName',
            isControllingOfficer: 'requestorStep.isControllingOfficerError',
        };

        this.clearError = inputKey => ReimbursementAccountUtils.clearError(this.props, inputKey);
        this.clearErrors = inputKeys => ReimbursementAccountUtils.clearErrors(this.props, inputKeys);
        this.getErrors = () => ReimbursementAccountUtils.getErrors(this.props);
    }

    /**
     * Clear the errors associated to keys in fieldUpdates if found and store the new values in the state.
     *
     * @param {Object} fieldUpdates
     */
    clearErrorsAndSetValues(fieldUpdates) {
        const renamedFields = {
            addressStreet: 'requestorAddressStreet',
            addressCity: 'requestorAddressCity',
            addressState: 'requestorAddressState',
            addressZipCode: 'requestorAddressZipCode',
        };
        const newState = {};
        _.each(fieldUpdates, (value, inputKey) => {
            const renamedInputKey = lodashGet(renamedFields, inputKey, inputKey);
            newState[renamedInputKey] = value;
        });
        this.setState(newState);
        BankAccounts.updateReimbursementAccountDraft(newState);

        // Prepare inputKeys for clearing errors
        const inputKeys = _.keys(fieldUpdates);

        // dob field has multiple validations/errors, we are handling it temporarily like this.
        if (_.contains(inputKeys, 'dob')) {
            inputKeys.push('dobAge');
        }
        this.clearErrors(inputKeys);
    }

    /**
     * Clear the error associated to inputKey if found and store the inputKey new value in the state.
     *
     * @param {String} inputKey
     * @param {String|Boolean} value
     */
    clearErrorAndSetValue(inputKey, value) {
        this.clearErrorsAndSetValues({[inputKey]: value});
    }

    /**
     * @returns {Boolean}
     */
    validate() {
        const errors = ValidationUtils.validateIdentity({
            firstName: this.state.firstName,
            lastName: this.state.lastName,
            addressStreet: this.state.requestorAddressStreet,
            addressState: this.state.requestorAddressState,
            addressCity: this.state.requestorAddressCity,
            addressZipCode: this.state.requestorAddressZipCode,
            dob: this.state.dob,
            ssnLast4: this.state.ssnLast4,
        });

        _.each(this.requiredFields, (inputKey) => {
            if (ValidationUtils.isRequiredFulfilled(this.state[inputKey])) {
                return;
            }

            errors[inputKey] = true;
        });
        if (_.size(errors)) {
            BankAccounts.setBankAccountFormValidationErrors(errors);
            BankAccounts.showBankAccountErrorModal();
            return false;
        }
        return true;
    }

    submit() {
        if (!this.validate()) {
            return;
        }

        const payload = {
            ...this.state,
            dob: moment(this.state.dob).format(CONST.DATE.MOMENT_FORMAT_STRING),
        };

        BankAccounts.setupWithdrawalAccount(payload);
    }

    render() {
        return (
            <>
                <HeaderWithCloseButton
                    title={this.props.translate('requestorStep.headerTitle')}
                    stepCounter={{step: 3, total: 5}}
                    shouldShowBackButton
                    onBackButtonPress={() => BankAccounts.goToWithdrawalAccountSetupStep(CONST.BANK_ACCOUNT.STEP.COMPANY)}
                    onCloseButtonPress={Navigation.dismissModal}
                />
                {this.props.achData.useOnfido && this.props.achData.sdkToken && !this.state.isOnfidoSetupComplete ? (
                    <Onfido
                        sdkToken={this.props.achData.sdkToken}
                        onUserExit={() => {
                            // We're taking the user back to the company step. They will need to come back to the requestor step to make the Onfido flow appear again.
                            BankAccounts.goToWithdrawalAccountSetupStep(CONST.BANK_ACCOUNT.STEP.COMPANY);
                        }}
                        onError={(error) => {
                            // In case of any unexpected error we log it to the server, show a growl, and return the user back to the company step so they can try again.
                            Log.hmmm('Onfido error in RequestorStep', {error});
                            Growl.error(this.props.translate('onfidoStep.genericError'), 10000);
                            BankAccounts.goToWithdrawalAccountSetupStep(CONST.BANK_ACCOUNT.STEP.COMPANY);
                        }}
                        onSuccess={(onfidoData) => {
                            this.setState({
                                onfidoData,
                                isOnfidoSetupComplete: true,
                            }, this.submit);
                        }}
                    />
                ) : (
                    <ReimbursementAccountForm
                        onSubmit={this.submit}
                    >
                        <Text>{this.props.translate('requestorStep.subtitle')}</Text>
                        <View style={[styles.mb5, styles.mt1, styles.dFlex, styles.flexRow]}>
                            <TextLink
                                style={[styles.textMicro]}
                                // eslint-disable-next-line max-len
                                href="https://community.expensify.com/discussion/6983/faq-why-do-i-need-to-provide-personal-documentation-when-setting-up-updating-my-bank-account"
                            >
                                {`${this.props.translate('requestorStep.learnMore')}`}
                            </TextLink>
                            <Text style={[styles.textMicroSupporting]}>{' | '}</Text>
                            <TextLink
                                style={[styles.textMicro, styles.textLink]}
                                // eslint-disable-next-line max-len
                                href="https://community.expensify.com/discussion/5677/deep-dive-security-how-expensify-protects-your-information"
                            >
                                {`${this.props.translate('requestorStep.isMyDataSafe')}`}
                            </TextLink>
                        </View>
                        <IdentityForm
                            onFieldChange={(inputKeyOrUpdatesBatch, value) => {
                                if (_.isString(inputKeyOrUpdatesBatch)) {
                                    this.clearErrorAndSetValue(inputKeyOrUpdatesBatch, value);
                                } else {
                                    // While we have batched updates to handle clearing errors properly
                                    this.clearErrorsAndSetValues(inputKeyOrUpdatesBatch);
                                }
                            }}
                            values={{
                                firstName: this.state.firstName,
                                lastName: this.state.lastName,
                                addressStreet: this.state.requestorAddressStreet,
                                addressState: this.state.requestorAddressState,
                                addressCity: this.state.requestorAddressCity,
                                addressZipCode: this.state.requestorAddressZipCode,
                                dob: this.state.dob,
                                ssnLast4: this.state.ssnLast4,
                            }}
                            errors={this.props.reimbursementAccount.errors}
                        />
                        <CheckboxWithLabel
                            isChecked={this.state.isControllingOfficer}
                            onPress={() => {
                                this.setState((prevState) => {
                                    const newState = {isControllingOfficer: !prevState.isControllingOfficer};
                                    BankAccounts.updateReimbursementAccountDraft(newState);
                                    return newState;
                                });
                                this.clearError('isControllingOfficer');
                            }}
                            LabelComponent={() => (
                                <View style={[styles.flex1, styles.pr1]}>
                                    <Text>
                                        {this.props.translate('requestorStep.isControllingOfficer')}
                                    </Text>
                                </View>
                            )}
                            style={[styles.mt4]}
                            hasError={Boolean(this.getErrors().isControllingOfficer)}
                            errorText={this.getErrors().isControllingOfficer ? this.props.translate('requestorStep.isControllingOfficerError') : ''}
                        />
                        <Text style={[styles.mt3, styles.textMicroSupporting]}>
                            {this.props.translate('requestorStep.onFidoConditions')}
                            <Text
                                onPress={() => Link.openExternalLink('https://onfido.com/facial-scan-policy-and-release/')}
                                style={[styles.textMicro, styles.link]}
                                accessibilityRole="link"
                            >
                                {`${this.props.translate('requestorStep.onFidoFacialScan')}`}
                            </Text>
                            {', '}
                            <Text
                                onPress={() => Link.openExternalLink('https://onfido.com/privacy/')}
                                style={[styles.textMicro, styles.link]}
                                accessibilityRole="link"
                            >
                                {`${this.props.translate('common.privacyPolicy')}`}
                            </Text>
                            {` ${this.props.translate('common.and')} `}
                            <Text
                                onPress={() => Link.openExternalLink('https://onfido.com/terms-of-service/')}
                                style={[styles.textMicro, styles.link]}
                                accessibilityRole="link"
                            >
                                {`${this.props.translate('common.termsOfService')}`}
                            </Text>
                        </Text>
                    </ReimbursementAccountForm>
                )}
            </>
        );
    }
}

RequestorStep.propTypes = propTypes;

export default compose(
    withLocalize,
    withOnyx({
        reimbursementAccount: {
            key: ONYXKEYS.REIMBURSEMENT_ACCOUNT,
        },
        reimbursementAccountDraft: {
            key: ONYXKEYS.REIMBURSEMENT_ACCOUNT_DRAFT,
        },
    }),
)(RequestorStep);
