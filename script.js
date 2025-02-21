// Helper / Utility functions
let current_customer_id;
let order_id;
let global_apple_pay_config;
let current_ap_session;
let applepay;
let apple_pay_email;
let pp_order_id;
let applepay_payment_event;
let script_to_head = (attributes_object) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      for (const name of Object.keys(attributes_object)) {
        script.setAttribute(name, attributes_object[name]);
      }
      document.head.appendChild(script);
      script.addEventListener('load', resolve);
      script.addEventListener('error', reject);
    });
}
let reset_purchase_button = () => {
    document.querySelector("#card-form").querySelector("input[type='submit']").removeAttribute("disabled");
    document.querySelector("#card-form").querySelector("input[type='submit']").value = "Purchase";
}

const is_user_logged_in = () => {
  return new Promise((resolve) => {
    customer_id = localStorage.getItem("logged_in_user_id") || "";
    resolve();
  });
}

const get_client_token = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch("/get_client_token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "customer_id": current_customer_id }),
      });

      const client_token = await response.text();
      resolve(client_token);
    } catch (error) {
      reject(error);
    }
  });
}
let handle_close = (event) => {
    event.target.closest(".ms-alert").remove();
}
let handle_click = (event) => {
    if (event.target.classList.contains("ms-close")) {
        handle_close(event);
    }
}
document.addEventListener("click", handle_click);
const paypal_sdk_url = "https://www.paypal.com/sdk/js";
const client_id = "AUQurPUrSAVSWXp7twNke8mdPDSdJoQtjEsDZEMYqvvME19EZ0B-B8sz8Hd3O7LVkmo_odAlEJJ_ryN3";
const currency = "USD";
const intent = "capture";

let display_error_alert = () => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth"
    });
    document.getElementById("alerts").innerHTML = `<div class="ms-alert ms-action2 ms-small"><span class="ms-close"></span><p>An Error Ocurred! (View console for more info)</p>  </div>`;
}
let display_success_message = (object) => {
    order_details = object.order_details;
    paypal_buttons = object.paypal_buttons;
    console.log(order_details); //https://developer.paypal.com/docs/api/orders/v2/#orders_capture!c=201&path=create_time&t=response
    let intent_object = intent === "authorize" ? "authorizations" : "captures";
    //Custom Successful Message
    document.getElementById("alerts").innerHTML = `<div class=\'ms-alert ms-action\'>Thank you ` + (order_details?.payer?.name?.given_name || ``) + ` ` + (order_details?.payer?.name?.surname || ``) + ` for your payment of ` + order_details.purchase_units[0].payments[intent_object][0].amount.value + ` ` + order_details.purchase_units[0].payments[intent_object][0].amount.currency_code + `!</div>`;

    //Close out the PayPal buttons that were rendered
    paypal_buttons.close();
    document.getElementById("card-form").classList.add("hide");
    document.getElementById("applepay-container").classList.add("hide");
}

//PayPal Code
is_user_logged_in()
.then(() => {
    return get_client_token();
})
.then((client_token) => {
    //https://developer.paypal.com/sdk/js/configuration/#link-queryparameters
    return script_to_head({"src": paypal_sdk_url + "?client-id=" + client_id + "&enable-funding=venmo&currency=" + currency + "&intent=" + intent + "&components=buttons,hosted-fields,applepay", "data-client-token": client_token}) //https://developer.paypal.com/sdk/js/configuration/#link-configureandcustomizeyourintegration
})
.then(() => {
    //Handle loading spinner
    document.getElementById("loading").classList.add("hide");
    document.getElementById("content").classList.remove("hide");
      //ApplePay Code
      let check_applepay = async () => {
        return new Promise((resolve, reject) => {
            let error_message = "";
            if (!window.ApplePaySession) {
              error_message = "This device does not support Apple Pay";
            } else
            if (!ApplePaySession.canMakePayments()) {
              error_message = "This device, although an Apple device, is not capable of making Apple Pay payments";
            }
            if (error_message !== "") {
              reject(error_message);
            } else {
              resolve();
            }
          });
      };
      //Begin Displaying of ApplePay Button
      check_applepay()
      .then(() => {
        applepay = paypal.Applepay();
        applepay.config()
        .then(applepay_config => {
          if (applepay_config.isEligible) {
            document.getElementById("applepay-container").innerHTML = '<apple-pay-button id="applepay_button" buttonstyle="black" type="plain" locale="en">';
            global_apple_pay_config = applepay_config;
            document.getElementById("applepay_button").addEventListener("click", handle_applepay_clicked);
          }
        })
        .catch(applepay_config_error => {
          console.error('Error while fetching Apple Pay configuration:');
          console.error(applepay_config_error);
        });
      })
      .catch((error) => {
        console.error(error);
      });
      let ap_payment_authed = (event) => {
          applepay_payment_event = event.payment;
          fetch("/create_order", {
              method: "post", headers: { "Content-Type": "application/json; charset=utf-8" },
              body: JSON.stringify({ "intent": intent })
          })
          .then((response) => response.json())
          .then((pp_data) => {
            pp_order_id = pp_data.id;
            apple_pay_email = applepay_payment_event.shippingContact.emailAddress;
            applepay.confirmOrder({
            orderId: pp_order_id,
            token: applepay_payment_event.token,
            billingContact: applepay_payment_event.billingContact
          })
          .then(confirmResult => {
            fetch("/complete_order", {
              method: "post", headers: { "Content-Type": "application/json; charset=utf-8" },
              body: JSON.stringify({
                  "intent": intent,
                  "order_id": pp_order_id,
                  "email": apple_pay_email
              })
          })
          .then((response) => response.json())
          .then((order_details) => {
            let intent_object = intent === "authorize" ? "authorizations" : "captures";
            if (order_details.purchase_units[0].payments[intent_object][0].status === "COMPLETED") {
              current_ap_session.completePayment(ApplePaySession.STATUS_SUCCESS);
              display_success_message({"order_details": order_details, "paypal_buttons": paypal_buttons});
            } else {
              current_ap_session.completePayment(ApplePaySession.STATUS_FAILURE);
              console.log(order_details);
              throw error("payment was not completed, please view console for more information");
            }
           })
           .catch((error) => {
              console.log(error);
              display_error_alert();
           });
          })
          .catch(confirmError => {
            if (confirmError) {
              console.error('Error confirming order with applepay token');
              console.error(confirmError);
              current_ap_session.completePayment(ApplePaySession.STATUS_FAILURE);
              display_error_alert();
            }
          });
        });
      };
      let ap_validate = (event) => {
        applepay.validateMerchant({
          validationUrl: event.validationURL,
          displayName: "My Demo Company"
        })
        .then(validateResult => {
          current_ap_session.completeMerchantValidation(validateResult.merchantSession);
        })
        .catch(validateError => {
          console.error(validateError);
          current_ap_session.abort();
        });
      };
      let handle_applepay_clicked = (event) => {
        const payment_request = {
          countryCode: global_apple_pay_config.countryCode,
          merchantCapabilities: global_apple_pay_config.merchantCapabilities,
          supportedNetworks: global_apple_pay_config.supportedNetworks,
          currencyCode: "USD",
          requiredShippingContactFields: ["name", "phone", "email", "postalAddress"],
          requiredBillingContactFields: ["postalAddress"],
          total: {
            label: "My Demo Company",
            type: "final",
            amount: "100.0",
          }
        };
        current_ap_session = new ApplePaySession(4, payment_request);
        current_ap_session.onvalidatemerchant = ap_validate;
        current_ap_session.onpaymentauthorized = ap_payment_authed;
        current_ap_session.begin()
      };
})
.catch((error) => {
    reset_purchase_button();
});