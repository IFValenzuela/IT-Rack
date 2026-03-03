const { Resend } = require('resend');

// Lazily create the client so it is only instantiated after dotenv has run.
function getClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

const emailService = {
  // Send password reset email
  async sendPasswordResetEmail(email, token) {
    const resetUrl = `${process.env.APP_URL}/reset-password.html?token=${token}`;

    try {
      const result = await getClient().emails.send({
        from: process.env.FROM_EMAIL,
        to: email,
        subject: 'Reset your IT Rack Stock password',
        html: `
          <h2>Password Reset Request</h2>
          <p>Click the link below to reset your password:</p>
          <p><a href="${resetUrl}" style="background: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
          <p>This link expires in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">IT Rack Stock Inventory System</p>
        `,
      });
      console.log('Resend result:', JSON.stringify(result));
    } catch (error) {
      console.error('Email send failed:', error);
      throw error;
    }
  },

  // Send welcome email (optional)
  async sendWelcomeEmail(email, username) {
    try {
      await getClient().emails.send({
        from: process.env.FROM_EMAIL,
        to: email,
        subject: 'Welcome to IT Rack Stock',
        html: `
          <h2>Welcome, ${username}!</h2>
          <p>Your account has been created successfully.</p>
          <p>You can now login at: <a href="${process.env.APP_URL}/login.html">Login here</a></p>
          <hr>
          <p style="color: #666; font-size: 12px;">IT Rack Stock Inventory System</p>
        `,
      });
    } catch (error) {
      console.error('Welcome email failed:', error);
      // Don't throw - welcome email is optional
    }
  },
};

module.exports = emailService;
