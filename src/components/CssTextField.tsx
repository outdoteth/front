import { TextField } from "@material-ui/core";
import { withStyles } from "@material-ui/core/styles";

const fancyStyle = {
  root: {
    "& label": {
      color: "teal",
    },
    "& input": {
      color: "teal",
      fontWeight: "1000",
    },
    // "& .MuiInputLabel-outlined.MuiInputLabel-shrink": {
    //   transform: "translate(14px, -4px) scale(0.55)",
    // },
    "& label.Mui-focused": {
      color: "white",
    },
    "& .MuiInput-underline:after": {
      borderBottomColor: "black",
    },
    "& .MuiOutlinedInput-root": {
      "& fieldset": {
        borderColor: "black",
        border: "2px solid black",
      },
      "&:hover fieldset": {
        borderColor: "black",
      },
      "&.Mui-focused fieldset": {
        borderColor: "black",
      },
    },
  },
};

const CssTextField = withStyles(fancyStyle)(TextField);

export default CssTextField;
