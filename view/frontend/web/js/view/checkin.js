define([
    'uiComponent',
    'jquery',
    'ko',
    'underscore',
    'mage/translate',
    'mage/storage',
    'Magento_Checkout/js/model/step-navigator',
    'Magento_Checkout/js/model/quote',
    'uiRegistry',
    'Magento_Checkout/js/model/new-customer-address',
    'Magento_Checkout/js/action/set-shipping-information',
    'PayEx_Checkin/js/action/open-shipping-information',
    'PayEx_Checkout/js/action/trigger-shipping-information-validation',
    'Magento_Checkout/js/model/address-converter',
    'Magento_Checkout/js/checkout-data',
    'checkinStyling',
    'mage/cookies'
], function (Component, $, ko, _, $t, storage, stepNavigator, quote, registry, newCustomerAddress, setShippingInformationAction, openShippingInformation, triggerShippingInformationValidation, addressConverter, checkoutData, checkinStyling) {
    'use strict';

    var PayEx = window.payex,
        onConsumerIdentifiedDelay = ko.observable(false),
        isVisible = ko.observable(false),
        isShippingSectionVisible = ko.observable(false),
        isRequired = ko.observable(false),
        isCheckedIn = ko.observable(false);

    return Component.extend({
        config: {
            data: {
                element: 'checkin-widget',
                shippingDetails: ko.observable({}),
                billingDetails: ko.observable({})
            }
        },
        isVisible: isVisible,
        isShippingSectionVisible: isShippingSectionVisible,
        isRequired: isRequired,
        isCheckedIn: isCheckedIn,
        initialize: function(config){
            var self = this;

            self._super();

            // Check if data comes from widget config or checkout config
            config.isCheckout = !config.hasOwnProperty('data');

            if(config.isCheckout) {
                Object.assign(self.config.data, window.checkoutConfig.PayEx_Checkin);
                self.config.isCheckout = config.isCheckout;

                self.isRequired((this.config.data.isRequired == true));

                stepNavigator.steps.subscribe(function(section){
                    stepNavigator.hideSection('shipping');
                    isShippingSectionVisible(false);
                });

            } else {
                Object.assign(self.config, config);
            }

            openShippingInformation.open = function(){
                self.proceedAsGuest();
            };

            // Make request to get consumer info if user logged in through checkin in current session
            self.checkIsCheckedIn();
        },
        checkIsCheckedIn: function(){
            var self = this;

            storage.post(
                this.config.data.OnConsumerReidentifiedUrl,
                "",
                true
            ).done(function(response){
                self.isVisible((self.config.data.isEnabled));

                // If previously logged in, autofill shipping and billing and don't load checkin window
                if(response.shipping_details || response.billing_details) {
                    if (self.config.isCheckout) {
                        setTimeout(function () {
                            self.autofillShippingDetails(response.shipping_details);
                            self.autofillBillingDetails(response.billing_details);
                            self.onCheckinValidation();
                        }, 500)
                    }
                } else {
                    if(!self.config.isCheckout) {
                        self.payexSetupHostedView();
                    }
                }

            }).fail(function(message){
                console.log(message);

                self.isVisible((self.config.data.isEnabled));
                self.payexSetupHostedView();
            });
        },
        onCheckinValidation: function(){
            var self = this,
                consumerProfileRef = $.cookie('consumerProfileRef');

            if(consumerProfileRef){
                self.isCheckedIn(true);

                triggerShippingInformationValidation.trigger(function(result) {
                    if(!result.success) {
                        self.proceedAsGuest();
                    }
                });
            }
        },
        proceedAsGuest: function(element, event){
            stepNavigator.showSection('shipping');
            this.isShippingSectionVisible(true);
        },
        payexSetupHostedView: function(){
            PayEx.hostedView.consumer({
                container: this.config.data.element,
                onConsumerIdentified: this.onConsumerIdentified.bind(this),
                onShippingDetailsAvailable: this.onShippingDetailsAvailable.bind(this),
                onBillingDetailsAvailable: this.onBillingDetailsAvailable.bind(this),
                style: checkinStyling
            }).open();
        },
        onConsumerIdentified: function(data){
            let self = this;

            if (data.hasOwnProperty('consumerProfileRef')) {
                $.cookie('consumerProfileRef', data.consumerProfileRef);
            }

            storage.post(
                this.config.data.OnConsumerIdentifiedUrl,
                JSON.stringify(data),
                true
            ).done(function(response){
                onConsumerIdentifiedDelay(true);
                self.isCheckedIn(true);
            }).fail(function(message){
                console.error(message);
            });
        },
        onShippingDetailsAvailable: function(data){
            let self = this;

            if (data.hasOwnProperty('url')) {
                $.cookie('shippingDetailsAvailableUrl', data.url);
            }

            onConsumerIdentifiedDelay.subscribe(function(value) {
                if(value) {
                    storage.post(
                        self.config.data.OnShippingDetailsAvailableUrl,
                        JSON.stringify(data),
                        true
                    ).done(function (response) {
                        if (self.config.isCheckout) {
                            self.autofillShippingDetails(response.data);
                        }
                    }).fail(function (message) {
                        console.error(message);
                    });
                }
            });

        },
        onBillingDetailsAvailable: function(data){
            let self = this;

            if (data.hasOwnProperty('url')) {
                $.cookie('billingDetailsAvailableUrl', data.url);
            }

            onConsumerIdentifiedDelay.subscribe(function(value) {
                if (value) {
                    storage.post(
                        self.config.data.OnBillingDetailsAvailableUrl,
                        JSON.stringify(data),
                        true
                    ).done(function (response) {
                        if (self.config.isCheckout) {
                            self.autofillBillingDetails(response.data);
                        }
                    }).fail(function (message) {
                        console.error(message);
                    });
                }
            });

        },
        separateAddressee: function(addressee) {
            var lastSpaceIndex = addressee.lastIndexOf(' ');

            return {
                firstname: addressee.substring(0, lastSpaceIndex),
                middlename: '',
                lastname: addressee.substring(lastSpaceIndex + 1)
            }
        },
        setEmailInputValue: function(email){
            var emailSelector = 'form[data-role=email-with-possible-login] input[type=email]';
            $(emailSelector).val(email).trigger('change');
        },
        getStreetAddressObject: function(streetAddressString){
            return {0: streetAddressString, 1: "", 2: "", 3: ""};
        },
        createAddressObject: function(payexAddress, addressKey) {

            if(!payexAddress[addressKey]){ return false; }

            var names = this.separateAddressee(payexAddress[addressKey].addressee);

            return {
                firstname: names.firstname,
                middlename: names.middlename,
                lastname: names.lastname,
                email: payexAddress.email,
                postcode: payexAddress[addressKey].zip_code,
                city: payexAddress[addressKey].city,
                street: this.getStreetAddressObject(payexAddress[addressKey].street_address),
                country_id: payexAddress[addressKey].country_code,
                company: '',
                canUseForBilling: ko.observable(true),
                telephone: payexAddress.msisdn
            }
        },
        autofillShippingDetails: function(payexShippingInformation){
            if(!payexShippingInformation) {
                return;
            }

            // Create new address object
            var shippingAddress = this.createAddressObject(payexShippingInformation, 'shipping_address');

            if(shippingAddress) {
                this.config.data.shippingDetails(shippingAddress);

                // Create new address object
                var address = newCustomerAddress(shippingAddress);
                address.street = this.getStreetAddressObject(payexShippingInformation['shipping_address'].street_address);

                // Set email input to logged in customer email
                this.setEmailInputValue(shippingAddress.email);

                // Update quote with logged in address object
                quote.shippingAddress(address);

                // Prepare address for auto-filling
                var addressFormPrepared = addressConverter.quoteAddressToFormAddressData(address);

                // Autofill fields
                registry.async('checkoutProvider')(function (checkoutProvider) {
                    checkoutProvider.set('shippingAddress', addressFormPrepared);
                });
            }
        },
        autofillBillingDetails: function(payexBillingInformation){
            if(!payexBillingInformation) {
                return;
            }

            // Create new address object
            var billingAddress = this.createAddressObject(payexBillingInformation, 'billing_address');

            if(billingAddress) {
                this.config.data.billingDetails(billingAddress);

                // Create new address object
                var address = newCustomerAddress(billingAddress);

                // Update quote with logged in address object
                quote.billingAddress(address);
            }
        }
    });
});