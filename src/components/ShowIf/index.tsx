import React from "react";

type ShowIfInterface = {
  if: boolean;
  show: React.ReactNode;
  else?: React.ReactNode | null;
};

const ShowIf: React.FC<ShowIfInterface> = (props) => {
  return props.if ? props.show : props.else ?? null;
};

export default ShowIf;
