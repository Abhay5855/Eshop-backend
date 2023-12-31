const User = require("../models/user");
const Token = require("../models/token");
const { validationResult } = require("express-validator");
const expressJwt = require("express-jwt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const sendEmail = require("./utils/sendEmail");
const BASE_URL = process.env.BASE_URL;
let bcryptSalt = process.env.BCRYPT_SALT;

// Signup route
exports.signup = (req, res) => {
  // Error handling
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const user = new User(req.body);
  user.save((err, user) => {
    if (err) {
      return res.status(400).json({
        err: "Not able to save user in DB",
      });
    }
    res.json({
      email: user?.email,
      id: user?._id,
      lastname: user?.lastname,
    });
  });
};

// Signin route
exports.login = (req, res) => {
  const { email, password } = req.body;

  User.findOne({ email }, (err, user) => {
    if (err || !user) {
      return res.status(400).json({
        err: "Email does not exist",
      });
    }

    if (!user.authenticate(password)) {
      return res.status(400).json({
        err: "Password do not match",
      });
    }

    // create token
    var token = jwt.sign({ _id: user._id }, "shhhhh");

    // send token in the cookie
    res.cookie("token", token, { expire: new Date() + 9999 });

    //send response to the frontend
    const { _id, name, email, role } = user;
    return res.json({
      token,
      user: { _id, email, name, role },
      userId: user._id,
    });
  });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
};

// Signout route
exports.signout = async (req, res) => {
  // Clear the cookie
  res.clearCookie("token");

  return res.json({
    message: "User logged out successfully !",
  });
};

exports.requestResetPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Email does not exist",
      });
    }

    // Delete any existing token for the user
    await Token.deleteMany({ userId: user._id });

    // Reset a new token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hash = await bcrypt.hash(resetToken, Number(bcryptSalt));

    // Save the token in the Token collection
    const newToken = new Token({ userId: user._id, token: hash });
    await newToken.save();

    // Generate the reset link
    const link = `${BASE_URL}/passwordReset?token=${resetToken}&id=${user._id}`;

    // Send the email
    sendEmail(
      user.email,
      "Password Reset Request",
      { name: user.name, link: link },
      "./template/requestResetPassword.handlebars"
    );

    res.json({
      link: link,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};


// Request reset password
// exports.requestResetPassword = async(req, res) => {
//   const { email } = req.body;

//   User.findOne({ email }, (err, user) => {
//     if (err || !user) {
//       return res.status(400).json({
//         message: "Email does not exist",
//       });
//     }
//     // Get the token first
//     let token = Token.findOne({ userId: user._id });

//     // If token is there delete the token
//     if (token) {
//       token.deleteOne();
//     }

//     // Reset a new token
//     let resetToken = crypto.randomBytes(32).toString("hex");
//     const hash = bcrypt.hash(resetToken, Number(bcryptSalt));

//     const newUser = new Token(req.body);

//     newUser.save((err, user) => {
//       if (err) {
//         return res.status(400).json({
//           message: "Failed to send the email",
//         });
//       }

//       res.json({
//         userId: user._id,
//         token: hash,
//         createdAt: Date.now(),
//       });
//     });

//     // generate a link to be sent to the mail -
//     let link = `${BASE_URL}/passwordReset?token=${resetToken}&id=${user._id}`;
//     sendEmail(
//       user.email,
//       "Password Reset Request",
//       { name: user.name, link: link },
//       "./template/requestResetPassword.handlebars"
//     );
//     return link;
//   });
// };

// Reset password
exports.resetPassword = (req, res) => {
  let passwordResetToken = User.findOne({ _id }, (user, err) => {
    if (err) {
      return res.status(400).json({
        message: "Invalid or expired password reset token",
      });
    }

    const hash = bcrypt.hash(user.password, Number(bcryptSalt));

    User.findOneAndUpdate(
      { _id: user.userId },
      { $set: { password: hash } },
      { new: true }
    );

    const updateUser = User.findById({ _id: user.userId });

    sendEmail(
      updateUser.email,
      "Password Reset Successfully",
      {
        name: updateUser.name,
      },
      "./template/resetPassword.handlebars"
    );

    passwordResetToken.deleteOne();

    return true;
  });

  if (!passwordResetToken) {
    return res.status(400).json({
      message: "Invalid or expired password reset token",
    });
  }
};

//Custom Middleware
exports.isAuthenticated = (req, res, next) => {
  let checker = req.profile && req.auth && req.profile._id == req.auth._id;

  if (!checker) {
    return res.status(403).json({
      error: "ACCESS DENIED",
    });
  }
  next();
};

// Protected
exports.isSignedin = expressJwt({
  secret: "shhhhh",
  userProperty: "auth",
});
