const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const paypal = require('paypal-rest-sdk');
const twilio = require('twilio');

const app = express();
const client = twilio('YOUR_TWILIO_ACCOUNT_SID', 'YOUR_TWILIO_AUTH_TOKEN');

app.use(bodyParser.json());

mongoose.connect('mongodb://localhost:27017/freefire', { useNewUrlParser: true, useUnifiedTopology: true });

const ParticipantSchema = new mongoose.Schema({
  phoneNumber: String,
  teamLeader: String,
  member1: String,
  member2: String,
  member3: String,
});

const Participant = mongoose.model('Participant', ParticipantSchema);

paypal.configure({
  mode: 'sandbox', // Change to 'live' for production
  client_id: 'YOUR_PAYPAL_CLIENT_ID',
  client_secret: 'YOUR_PAYPAL_CLIENT_SECRET',
});

app.post('/api/participate', async (req, res) => {
  try {
    const participant = new Participant(req.body);
    await participant.save();

    // Create payment
    const createPaymentJson = {
      intent: 'sale',
      payer: {
        payment_method: 'paypal',
      },
      redirect_urls: {
        return_url: 'http://localhost:5000/success',
        cancel_url: 'http://localhost:5000/cancel',
      },
      transactions: [{
        item_list: {
          items: [{
            name: 'FreeFire Participation Fee',
            sku: '001',
            price: '10.00',
            currency: 'USD',
            quantity: 1,
          }],
        },
        amount: {
          currency: 'USD',
          total: '10.00', // Participation fee
        },
        description: 'Participation fee for FreeFire competition',
      }],
    };

    paypal.payment.create(createPaymentJson, function (error, payment) {
      if (error) {
        throw error;
      } else {
        for (let i = 0; i < payment.links.length; i++) {
          if (payment.links[i].rel === 'approval_url') {
            res.redirect(payment.links[i].href);
          }
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/success', (req, res) => {
  const payerId = req.query.PayerID;
  const paymentId = req.query.paymentId;

  const executePaymentJson = {
    payer_id: payerId,
    transactions: [{
      amount: {
        currency: 'USD',
        total: '10.00', // Participation fee
      },
    }],
  };

  paypal.payment.execute(paymentId, executePaymentJson, function (error, payment) {
    if (error) {
      console.error(error);
      res.redirect('/cancel');
    } else {
      // Payment successful
      // Send WhatsApp message
      client.messages.create({
        from: 'whatsapp:+14155238886',
        to: `whatsapp:${participant.phoneNumber}`,
        body: 'Room number and password will be shared in few minutes.',
      });

      // Send admin message
      // Adjust the message as per your requirement
      client.messages.create({
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:YOUR_ADMIN_PHONE_NUMBER',
        body: `New participant registered\nPhone Number: ${participant.phoneNumber}\nName: ${participant.teamLeader}\nPayment successful.`,
      });

      res.send('Payment successful!');
    }
  });
});

app.get('/cancel', (req, res) => {
  res.send('Payment cancelled.');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
