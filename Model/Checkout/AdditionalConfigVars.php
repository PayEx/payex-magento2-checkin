<?php

namespace PayEx\Checkin\Model\Checkout;

use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Framework\UrlInterface;
use PayEx\Checkin\Helper\Config;

class AdditionalConfigVars implements ConfigProviderInterface
{

    /**
     * @var \PayEx\Checkin\Helper\Config
     */
    protected $config;

    /**
     * @var UrlInterface
     */
    private $urlBuilder;

    /**
     * AdditionalConfigVars constructor.
     *
     * @param \PayEx\Checkin\Helper\Config $config
     * @param UrlInterface $urlBuilder
     */
    public function __construct(
        Config $config,
        UrlInterface $urlBuilder
    ) {
        $this->config = $config;
        $this->urlBuilder = $urlBuilder;
    }

    /**
     * @return array
     */
    public function getConfig()
    {
        return [
            'PayEx_Checkin' => [
                'isEnabled' => $this->config->getValue('active'),
                'isRequired' => $this->config->getValue('required'),
                'OnConsumerIdentifiedUrl' => $this->urlBuilder->getUrl('PayExCheckin/Index/OnConsumerIdentified'),
                'OnConsumerReidentifiedUrl' => $this->urlBuilder->getUrl('PayExCheckin/Index/OnConsumerReidentified'),
                'OnBillingDetailsAvailableUrl' => $this->urlBuilder->getUrl('PayExCheckin/Index/OnBillingDetailsAvailable'),
                'OnShippingDetailsAvailableUrl' => $this->urlBuilder->getUrl('PayExCheckin/Index/OnShippingDetailsAvailable')
            ]
        ];
    }
}
