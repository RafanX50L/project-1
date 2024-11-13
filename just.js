async function initiateOnlinePayment(orderData) {
    try {
        const response = await fetch('/user/create-razorpay-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...orderData, currency: 'INR' })
        });

        const order = await response.json();
        if (response.ok) {
            openRazorpay(order);
        } else {
            alert('Error creating Razorpay order.');
        }
    } catch (error) {
        console.error('Error initiating online payment:', error);
    }
}

function openRazorpay(order) {
    const options = {
        key: 'rzp_test_3EYdWsxcryrgrR', 
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        handler: verifyPayment,
        prefill: { name: 'Rafan', email: 'rafan123@gmail.com', contact: '8281652046' },
        theme: { color: '#0000' }
    };
    const rzp = new Razorpay(options);
    rzp.open();
}

async function verifyPayment(response) {
    try {
        const addressId = document.querySelector('input[name="selectedAddress"]:checked')?.value;
        const totalAmount = parseFloat(document.getElementById('totalPriceDisplay').textContent.replace('$', '').trim()) || 0;
        const discount = parseFloat(document.getElementById('discountAmount').textContent.replace('$', '').trim()) || 0;
        const offerDiscount = parseFloat(document.getElementById("offerDiscount").textContent.replace('$', '').trim()) || 0;
        const deliveryCharge = parseFloat(document.getElementById("deliveryCharge").textContent.replace('$', '').trim()) || 0;

        const verifyResponse = await fetch('/user/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                addressId,
                totalAmount,
                discount,
                offerDiscount,
                deliveryCharge
            })
        });

        const result = await verifyResponse.json();
        if (verifyResponse.ok) {
            Swal.fire({
                icon: 'success',
                title: 'Order Placed Successfully!',
                confirmButtonText: 'OK'
            }).then(() => {
                window.location.href = /user/order-success/${result.orderId};
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: 'Order Placed without money!',
                confirmButtonText: 'OK'
            }).then(() => {
                window.location.href = /user/orderhistory;
            });				}
    } catch (error) {
        console.error('Error verifying payment:', error);
    }
}