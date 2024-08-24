import { isExcalidrawPlusSignedUser } from "../app_constants";

export const ExcalidrawPlusAppLink = () => {
  if (!isExcalidrawPlusSignedUser) {
    return null;
  }
  return <></>;
};
